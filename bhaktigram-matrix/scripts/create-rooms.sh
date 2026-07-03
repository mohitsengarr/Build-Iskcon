#!/usr/bin/env bash
# Create the 4 Bhaktigram sangha rooms on the homeserver — PUBLIC, UNENCRYPTED,
# shared history. Run ONCE after the server is up and you have an admin token.
#
# Usage:
#   MATRIX_HOST=chat.buildiskcon.com ADMIN_TOKEN=syt_xxx ./create-rooms.sh
#
# Get ADMIN_TOKEN by logging the admin user in:
#   curl -s -XPOST "https://$MATRIX_HOST/_matrix/client/v3/login" \
#     -d '{"type":"m.login.password","user":"admin","password":"..."}' | jq -r .access_token
#
# It prints a slug -> room_id table. Paste that table into the client module
# (src/lib/matrix-rooms.ts) so the apps can resolve room slugs to room IDs.
set -euo pipefail

: "${MATRIX_HOST:?set MATRIX_HOST, e.g. chat.buildiskcon.com}"
: "${ADMIN_TOKEN:?set ADMIN_TOKEN (admin user access token)}"

base="https://${MATRIX_HOST}/_matrix/client/v3/createRoom"

# slug|Display name
rooms=(
  "sangha|Sangha"
  "bhagavatam|Srimad Bhagavatam"
  "chaitanya|Chaitanya Charitamrta"
  "kirtan|Kirtan"
)

echo "// slug -> roomId  (paste into matrix-rooms.ts)"
echo "export const ROOM_IDS: Record<string, string> = {"
for entry in "${rooms[@]}"; do
  slug="${entry%%|*}"
  name="${entry##*|}"
  body=$(cat <<JSON
{
  "name": "${name}",
  "preset": "public_chat",
  "visibility": "public",
  "room_alias_name": "${slug}",
  "initial_state": [
    { "type": "m.room.history_visibility", "state_key": "", "content": { "history_visibility": "shared" } }
  ]
}
JSON
)
  resp=$(curl -s -XPOST "$base" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body")
  room_id=$(printf '%s' "$resp" | sed -n 's/.*"room_id":"\([^"]*\)".*/\1/p')
  if [ -z "$room_id" ]; then
    echo >&2 "FAILED for ${slug}: ${resp}"
    exit 1
  fi
  echo "  ${slug}: \"${room_id}\","
done
echo "};"
