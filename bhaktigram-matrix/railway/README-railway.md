# Deploy Bhaktigram's Matrix homeserver on Railway

This is the **recommended** host (no VPS, no ops). Two Railway services:
**Postgres** + **Synapse** (built from `railway/Dockerfile`). ~$5–15/mo on Hobby.

> Why a custom image: Synapse's one-shot `generate` doesn't fit a PaaS deploy, so
> `Dockerfile` + `docker-entrypoint.sh` generate config + signing keys onto the
> volume on first boot and apply our settings from env on every boot.

---

## Decide first (permanent / long-lead)
- **`MATRIX_HOST` = `chat.buildiskcon.com`** — baked into every `@user:HOST` id forever.
  Use a **custom domain from day one** (don't ship on the `*.up.railway.app` URL, or the
  ids are stuck on it).
- **OTP SMS provider** (MSG91/Twilio) + **India DLT** — start in parallel (multi-day).

---

## 1) Postgres service (with the C collation Synapse requires)

Easiest guaranteed-correct path: deploy your **own** Postgres (not the managed plugin),
so the `LC_COLLATE=C` init arg is applied.

- New Service → **Docker Image** → `postgres:16-alpine`.
- Variables:
  - `POSTGRES_USER=synapse`
  - `POSTGRES_PASSWORD=` *(generate a strong one)*
  - `POSTGRES_DB=synapse`
  - `POSTGRES_INITDB_ARGS=--encoding=UTF-8 --lc-collate=C --lc-ctype=C`
- Attach a **Volume** mounted at `/var/lib/postgresql/data`.

> Prefer Railway's **managed Postgres** instead? You can, but its default DB may not be
> C-collated. After adding it, connect and run:
> `CREATE DATABASE synapse TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C' ENCODING 'UTF8';`
> and point `PGDATABASE` at that DB.

## 2) Synapse service (this folder)

- New Service → **Deploy from Repo** → set **Root Directory** = `bhaktigram-matrix/railway`
  (Railway builds the `Dockerfile`). *(Or `railway up` from this folder.)*
- Attach a **Volume** mounted at **`/data`** (signing keys + config live here — back this up).
- **Settings → Networking:** add the custom domain `chat.buildiskcon.com`
  (Railway gives you a CNAME target → add it at your DNS) and let Railway issue TLS.
- **Variables** (reference the Postgres service's vars for the PG* values):

  ```
  SYNAPSE_SERVER_NAME       = chat.buildiskcon.com
  PUBLIC_BASEURL            = https://chat.buildiskcon.com/
  SYNAPSE_REPORT_STATS      = no
  MATRIX_REG_SHARED_SECRET  = <long random — the bridge uses the SAME value>
  PGHOST                    = ${{Postgres.PGHOST}}      # or RAILWAY_PRIVATE_DOMAIN of the PG service
  PGPORT                    = 5432
  PGUSER                    = synapse
  PGPASSWORD                = ${{Postgres.POSTGRES_PASSWORD}}
  PGDATABASE                = synapse
  ```
  (Railway injects `PORT`; the entrypoint binds Synapse to it.)

- Deploy. Watch logs for `starting Synapse on :<port>`.

## 3) Verify, create admin, seed rooms

```bash
# Server alive?
curl -s https://chat.buildiskcon.com/_matrix/client/versions      # -> JSON

# Create the admin (run locally; uses the same shared secret):
MATRIX_HOST=chat.buildiskcon.com \
MATRIX_REG_SHARED_SECRET='<the secret>' \
ADMIN_USER=admin ADMIN_PASS='<strong>' \
  ../scripts/make-admin.sh                                        # -> {access_token,...}

# Seed the 4 sangha rooms (prints the slug->roomId table):
MATRIX_HOST=chat.buildiskcon.com ADMIN_TOKEN=<access_token from above> \
  ../scripts/create-rooms.sh
```

## 4) Hand me the outputs → I finish Phases 1–4

Send me:
- the `slug -> roomId` table from step 3,
- confirmation the server responds on `https://chat.buildiskcon.com`.

Then I:
- deploy the **bridge** Edge Function and set its secrets (`MATRIX_BASE_URL`,
  `MATRIX_REG_SHARED_SECRET`, `BHAKTIGRAM_PHONE_PEPPER`, `MATRIX_ROOM_IDS`),
- wire the **web** then **RN** chat behind the `DATA_BACKEND` flag + the Supabase
  Phone-OTP login screen, Supabase chat staying default until parity is proven.

---

## Security notes on Railway
- Railway has no path firewall, so `/_synapse/admin/*` is reachable — but it's
  **token-gated** (needs an admin access token; the register endpoint needs the
  shared secret + a one-time nonce). Keep the admin token + shared secret secret;
  optionally front Synapse with a Caddy service later to IP-restrict admin.
- The `/data` volume holds your **signing keys** — if you lose it the server identity
  is gone. Enable Railway volume backups.
- Use **node ≥ 20.19.4 / 22** for any build step (clears the engine warning).
