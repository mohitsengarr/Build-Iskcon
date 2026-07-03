# Bhaktigram chat on self-hosted Matrix (Synapse)

Replaces the Supabase Realtime chat backend with a **free, self-hosted Matrix homeserver
(Synapse Community)**, keeping the existing WhatsApp-style UI on both surfaces
(web `temple-tracker/.../bhaktigram-chat.tsx` and the Expo app `bhaktigram-app/`).
We swap **only the data layer** — the render trees, styles, optimistic-send flow,
day-dividers and unread tracking stay exactly as they are.

**Login model: phone number + OTP** (not anonymous). Verification runs through
**Supabase Auth Phone OTP** (you're already on Supabase), then a trusted bridge
mints a Matrix token for the verified phone.

---

## Architecture (3 tiers)

```
  ┌─────────────────────────────┐     1. phone → OTP        ┌──────────────────────┐
  │  Client (web + Expo RN)      │ ───────────────────────▶ │  Supabase Auth        │
  │  • your existing chat UI     │ ◀─────────────────────── │  (Phone OTP via SMS)   │
  │  • matrix-js-sdk data layer  │     2. verified session   └──────────────────────┘
  └───────────┬─────────────────┘
              │ 3. POST /bridge/provision  (Bearer = Supabase JWT)
              ▼
  ┌─────────────────────────────┐   4. shared-secret register / lookup
  │  Identity bridge (Supabase   │ ─────────────────────────────────────┐
  │  Edge Function)              │                                       ▼
  │  • verifies Supabase JWT     │                         ┌──────────────────────────┐
  │  • phone → Matrix user (1:1) │                         │  Synapse homeserver        │
  │  • returns Matrix token      │ ◀───────────────────────│  (this folder: Docker)     │
  └───────────┬─────────────────┘   5. {user_id, token}    │  + PostgreSQL              │
              │                                             │  federation OFF, E2EE OFF  │
              │ 6. createClient(token) → /sync + sendEvent  └──────────────────────────┘
              ▼
        live messages render in your existing UI
```

- **Synapse** holds the rooms + messages. **No user cap** (unlike Rocket.Chat ~100).
- **The bridge is the one security boundary**: it holds the registration shared secret;
  the client never does. One Matrix user **per verified phone** (not per device), so a
  user keeps their identity across web + app.
- **The Supabase chat stays LIVE** behind a feature flag until Matrix is validated on both
  surfaces — no big-bang cutover.

---

## ⚠️ Decisions to lock BEFORE you run anything

| Decision | Why it's locked early | Suggested |
|---|---|---|
| **`MATRIX_HOST`** (the homeserver domain) | Baked permanently into every `@user:HOST` and `!room:HOST` id. Cannot change without a fresh server. | `chat.buildiskcon.com` |
| **Auth stack = legacy (NOT MAS)** | The shared-secret register API the bridge needs is **disabled** under Matrix Authentication Service (OAuth2). Stay on legacy. | legacy (do nothing — it's the default) |
| **SMS/OTP provider** | OTP costs money + (India) needs **DLT registration**, which has multi-day lead time — start early. | **MSG91** (India) or **Twilio** (global), wired into Supabase Auth |

---

## Phase 0 — Stand up the homeserver

> **Recommended host: Railway** (no VPS, no ops, managed Postgres + auto-TLS) —
> follow **[railway/README-railway.md](railway/README-railway.md)**. Vercel can't
> host Synapse (it's serverless). The VPS / `docker-compose` route below is the
> equivalent self-managed alternative.

### Option B — your own VPS (docker-compose)

Prereqs: a small VPS (~2 GB RAM, Docker + `docker compose`), DNS `A` record for
`MATRIX_HOST` → the VPS, and ports 80/443 open.

```bash
# 0. On the VPS, copy this folder (bhaktigram-matrix/) over, then cd into it.
mkdir -p files pgdata
# Edit docker-compose.yml: set CHANGE_ME_STRONG_DB_PASSWORD.

# 1. Start Postgres first (so its data volume initialises with C/UTF-8 collation).
docker compose up -d db

# 2. One-shot: generate Synapse config + signing keys.
#    Replace chat.buildiskcon.com with your MATRIX_HOST.
docker run -it --rm -v "$PWD/files:/data" \
  -e SYNAPSE_SERVER_NAME=chat.buildiskcon.com \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate

# 3. Edit files/homeserver.yaml — see "homeserver.yaml edits" below.

# 4. Bring the whole stack up.
docker compose up -d

# 5. Create the first admin user (answer "Make admin? yes").
docker exec -it bhaktigram-synapse \
  register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008

# 6. Point your reverse proxy at it (reverse-proxy/nginx.conf — replace MATRIX_HOST,
#    get TLS via certbot), reload nginx, then sanity-check:
curl -s https://chat.buildiskcon.com/_matrix/client/versions   # -> JSON list of versions

# 7. Seed the 4 sangha rooms.
MATRIX_HOST=chat.buildiskcon.com ADMIN_TOKEN=<admin token> ./scripts/create-rooms.sh
```

### homeserver.yaml edits (after step 2, before step 4)

The `generate` step writes `files/homeserver.yaml` with the right secrets and signing keys.
Change/confirm these keys:

```yaml
server_name: "chat.buildiskcon.com"          # == MATRIX_HOST (permanent)
public_baseurl: "https://chat.buildiskcon.com/"

# Talk to the Postgres container (NOTE: the key is `dbname`, not `database`).
database:
  name: psycopg2
  args:
    user: synapse
    password: CHANGE_ME_STRONG_DB_PASSWORD   # match docker-compose.yml
    dbname: synapse
    host: db
    port: 5432
    cp_min: 5
    cp_max: 10

# The generated listener binds to 127.0.0.1 only — inside Docker the proxy can't
# reach that. Bind 0.0.0.0 and keep x_forwarded so real client IPs are logged.
listeners:
  - port: 8008
    tls: false
    type: http
    x_forwarded: true
    bind_addresses: ['0.0.0.0']
    resources:
      - names: [client]                       # federation deliberately omitted

# Accounts: NO open signup. The bridge creates users via the shared secret.
enable_registration: false
allow_guest_access: false
registration_shared_secret: "PASTE_A_LONG_RANDOM_SECRET_HERE"   # keep server-side ONLY

# Closed community: no federation, public rooms not advertised off-server.
federation_domain_whitelist: []               # also firewall port 8448 (we don't publish it)
allow_public_rooms_over_federation: false

# Public feed = plaintext. (Default is already off; be explicit. MUST quote "off"
# — unquoted off is parsed as the YAML boolean false.)
encryption_enabled_by_default_for_room_type: "off"

# The default 1 msg / 5s is too slow for an active feed — raise it.
rate_limiting:
  rc_message:
    per_second: 1
    burst_count: 20
```

> `register_new_matrix_user` (step 5) needs `registration_shared_secret` set **and** the
> server restarted after you set it. Keep that secret out of every client bundle — leaking
> it lets anyone mint **admin** accounts.

When done: `https://federationtester.matrix.org` should report your server as **not federating**
(expected), and `/_matrix/client/versions` returns JSON over HTTPS.

---

## Phase 1 — Phone+OTP identity bridge + rooms  *(me, after the server is up)*

A **Supabase Edge Function** `bridge-provision`:
1. Requires a valid **Supabase session** (the caller already passed phone OTP via
   `supabase.auth.signInWithOtp` → `verifyOtp`). Verifies the JWT → trusts `auth.phone`.
2. Looks up `phone → matrix_user` in a small Supabase table. First time: derives a
   **private, non-PII** localpart (`bg_` + `sha256(phone + serverPepper)` truncated),
   then registers it on Synapse via the shared-secret admin register flow
   (`GET /_synapse/admin/v1/register` → nonce → `POST` with `HMAC-SHA1(secret, nonce\x00user\x00pass\x00notadmin)`).
3. Joins that user to the 4 sangha room IDs.
4. Returns **only** `{ user_id, access_token, device_id }` to the client.

Display name = the user's chosen `bhaktigram_author`, sent **per message** (so a rename
needs no re-auth, exactly like today) and optionally mirrored to the Matrix profile.

---

## Phase 2–5 — Client + cutover  *(me)*

- **P2 — shared `matrixChat` module** on matrix-js-sdk (web = IndexedDB store; RN =
  MemoryStore, **no E2EE**). Exposes `subscribe / sendText / loadHistory` matching what the
  current Supabase layer gives the components. **Includes the RN spike** (prove the SDK
  imports + `/sync`es under Expo SDK 56 / Hermes with `react-native-get-random-values` +
  `metro.config.js` shims — `react-native-url-polyfill` is already in the app).
- **P3 — wire the web** behind a `DATA_BACKEND` flag (Supabase stays default until parity).
- **P4 — wire the RN app** behind the same flag.
- **P5 — moderation + cutover:** self-host **Synapse-Admin / Ketesa** (bound to localhost) for
  a moderation GUI; optional Supabase→Matrix history backfill; flip the flag to Matrix on both
  surfaces, keep Supabase read-only one release as rollback, then remove.

---

## Message mapping (preserves the existing `ChatMessage` contract)

`m.room.message` → `{ id, room, device_id, author_name, body, created_at }`:
- `id` = `event.getTs()` (ms number — keeps the existing `>`/seen/`>1e12` optimistic math),
  plus a new `event_id?: string` carried alongside for dedupe (the **one** schema touch,
  applied to both surfaces' types together).
- `room` = reverse-map `roomId → slug`.
- `device_id` / `author_name` = custom content fields `in.iskcon.device_id` / `in.iskcon.author`
  (so "mine vs others" and the `device_id === 'system'` system-bubble convention keep working).
- `body` = `content.body`; `created_at` = ISO of the ts.

---

## Operating notes / risks
- **You now run a server:** Postgres backups, TLS renewal, `docker compose pull` upgrades, RAM
  watch. Postgres must stay C-collation + UTF-8 + v13+ (set at first init only).
- **RN is community-supported** for matrix-js-sdk (works with polyfills, E2EE off). If the P2
  spike fails, the RN app can fall back to raw `/_matrix` REST + a manual `/sync` loop reusing the
  same message mapping.
- **Per-phone account growth + abuse:** rate-limit the bridge; one account per phone caps bloat.
- **`/_synapse/admin/*` must never be public** (the nginx config blocks it by default).
