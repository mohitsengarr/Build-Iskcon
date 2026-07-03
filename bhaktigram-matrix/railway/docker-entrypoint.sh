#!/usr/bin/env bash
# Bhaktigram Synapse entrypoint for Railway / Docker-PaaS.
#  - first boot: generate homeserver.yaml + signing keys onto the volume (/data)
#  - every boot: (re)write overrides.yaml from env so config tracks Railway vars
#  - launch Synapse with base config + overrides (later file wins)
set -euo pipefail

DATA="${SYNAPSE_DATA_DIR:-/data}"
SYN_UID=991
SYN_GID=991

: "${SYNAPSE_SERVER_NAME:?set SYNAPSE_SERVER_NAME (e.g. chat.buildiskcon.com) — PERMANENT}"
: "${PUBLIC_BASEURL:?set PUBLIC_BASEURL (e.g. https://chat.buildiskcon.com/)}"
: "${MATRIX_REG_SHARED_SECRET:?set MATRIX_REG_SHARED_SECRET (long random; the bridge uses the same value)}"
: "${PGHOST:?set PGHOST}"; : "${PGUSER:?set PGUSER}"; : "${PGPASSWORD:?set PGPASSWORD}"; : "${PGDATABASE:?set PGDATABASE}"

mkdir -p "$DATA"
chown -R "$SYN_UID:$SYN_GID" "$DATA"

if [ ! -f "$DATA/homeserver.yaml" ]; then
  echo "[bhaktigram] first boot — generating base config + signing keys"
  gosu "$SYN_UID:$SYN_GID" python -m synapse.app.homeserver \
    --server-name "$SYNAPSE_SERVER_NAME" \
    --config-path "$DATA/homeserver.yaml" \
    --generate-config \
    --report-stats="${SYNAPSE_REPORT_STATS:-no}"
fi

# Overrides — rewritten each boot so changing a Railway env var + redeploy applies.
# (`dbname` is the correct psycopg2 arg key for current Synapse.)
cat > "$DATA/overrides.yaml" <<YAML
server_name: "${SYNAPSE_SERVER_NAME}"
public_baseurl: "${PUBLIC_BASEURL}"
serve_server_wellknown: true

# Keep all data on the persistent volume (relative paths resolve from /data).
media_store_path: "${DATA}/media_store"
log_config: "${DATA}/log.config"

database:
  name: psycopg2
  args:
    user: "${PGUSER}"
    password: "${PGPASSWORD}"
    dbname: "${PGDATABASE}"
    host: "${PGHOST}"
    port: ${PGPORT:-5432}
    cp_min: 5
    cp_max: 10

listeners:
  - port: ${PORT:-8008}
    tls: false
    type: http
    x_forwarded: true          # Railway sets X-Forwarded-For/Proto
    bind_addresses: ['0.0.0.0']
    resources:
      - names: [client]
        compress: false

# No open signup — the bridge mints users via the shared secret.
enable_registration: false
allow_guest_access: false
registration_shared_secret: "${MATRIX_REG_SHARED_SECRET}"

# Closed community: no federation, directory not advertised off-server.
federation_domain_whitelist: []
allow_public_rooms_over_federation: false

# Public feed = plaintext (quote "off" — unquoted parses as YAML false).
encryption_enabled_by_default_for_room_type: "off"

# The default ~1 msg / 5s is too slow for an active feed.
rc_message:
  per_second: 1
  burst_count: 20
YAML
chown "$SYN_UID:$SYN_GID" "$DATA/overrides.yaml"

# Console-only logging — Railway captures stdout; avoids the generated file
# handler that can't open its log file on the container filesystem.
cat > "$DATA/log.config" <<'LOGYAML'
version: 1
formatters:
  precise:
    format: '%(asctime)s - %(name)s - %(lineno)d - %(levelname)s - %(request)s - %(message)s'
handlers:
  console:
    class: logging.StreamHandler
    formatter: precise
root:
  level: INFO
  handlers: [console]
disable_existing_loggers: false
LOGYAML
chown "$SYN_UID:$SYN_GID" "$DATA/log.config"

echo "[bhaktigram] starting Synapse on :${PORT:-8008} as ${SYNAPSE_SERVER_NAME}"
cd "$DATA"   # so any relative paths resolve under the persistent volume
exec gosu "$SYN_UID:$SYN_GID" python -m synapse.app.homeserver \
  -c "$DATA/homeserver.yaml" -c "$DATA/overrides.yaml"
