#!/usr/bin/env bash
# Create a Synapse ADMIN user via the shared-secret register API — run from your
# laptop once the homeserver is live. No container shell needed.
#
# Usage:
#   MATRIX_HOST=chat.buildiskcon.com \
#   MATRIX_REG_SHARED_SECRET='the same secret you set on the server' \
#   ADMIN_USER=admin ADMIN_PASS='a-strong-password' \
#   ./make-admin.sh
#
# Prints {access_token,...}. Use that token with create-rooms.sh and the Admin API.
set -euo pipefail

: "${MATRIX_HOST:?set MATRIX_HOST}"
: "${MATRIX_REG_SHARED_SECRET:?set MATRIX_REG_SHARED_SECRET}"
: "${ADMIN_USER:=admin}"
: "${ADMIN_PASS:?set ADMIN_PASS}"

base="https://${MATRIX_HOST}/_synapse/admin/v1/register"

nonce=$(curl -s "$base" | sed -n 's/.*"nonce":"\([^"]*\)".*/\1/p')
[ -n "$nonce" ] || { echo "could not get nonce from $base" >&2; exit 1; }

# mac = HMAC-SHA1(secret, nonce \0 user \0 pass \0 'admin')   (admin:true => 'admin')
mac=$(printf '%s\0%s\0%s\0admin' "$nonce" "$ADMIN_USER" "$ADMIN_PASS" \
  | openssl dgst -sha1 -hmac "$MATRIX_REG_SHARED_SECRET" | sed 's/^.*= *//')

curl -s -XPOST "$base" -H 'Content-Type: application/json' \
  -d "{\"nonce\":\"${nonce}\",\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\",\"admin\":true,\"mac\":\"${mac}\"}"
echo
