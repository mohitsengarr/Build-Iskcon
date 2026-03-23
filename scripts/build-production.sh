#!/bin/bash
set -e

echo "=== Installing dependencies ==="
pnpm install --frozen-lockfile

echo "=== Building Temple Tracker frontend (BASE_PATH=/) ==="
BASE_PATH=/ pnpm --filter @workspace/temple-tracker run build

echo "=== Building API Server ==="
pnpm --filter @workspace/api-server run build

echo "=== Production build complete ==="
