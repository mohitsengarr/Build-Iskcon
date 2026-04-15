#!/bin/bash
# Build-ISKCON Services Startup Script
# Starts the API server + all cron services (Bhagwatham OCR, Instagram, Temple Discovery, Shlok Indexer)
# Usage: ./start-services.sh
# Used by macOS LaunchAgent for auto-restart after reboot

set -euo pipefail

PROJECT_DIR="/Users/mohitsengarr/Documents/Code/Sengar/Build-Iskcon"
LOG_DIR="$PROJECT_DIR/logs"
PID_FILE="$LOG_DIR/server.pid"
NODE_BIN="/Users/mohitsengarr/.nvm/versions/node/v20.17.0/bin/node"
NPX_BIN="/Users/mohitsengarr/.nvm/versions/node/v20.17.0/bin/npx"
PNPM_BIN="/Users/mohitsengarr/.nvm/versions/node/v20.17.0/bin/pnpm"
TSX_BIN="$PROJECT_DIR/node_modules/.pnpm/node_modules/.bin/tsx"

# Ensure PATH has node
export PATH="/Users/mohitsengarr/.nvm/versions/node/v20.17.0/bin:$PATH"

# Create logs directory
mkdir -p "$LOG_DIR"

# Check if server is already running
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[$(date)] Server already running (PID $OLD_PID). Stopping it first..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
    # Force kill if still alive
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Also kill any existing tsx/node processes running our server
pkill -f "tsx.*api-server.*src/index.ts" 2>/dev/null || true
# Free port 5001 if anything else is using it
lsof -ti :5001 | xargs kill -9 2>/dev/null || true
sleep 1

cd "$PROJECT_DIR/artifacts/api-server"

echo "[$(date)] Starting Build-ISKCON server..."

# Start server with tsx (dev mode — uses env-file)
nohup "$TSX_BIN" --env-file=../../.env src/index.ts \
  >> "$LOG_DIR/server.log" 2>&1 &

SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

echo "[$(date)] Server started (PID $SERVER_PID)"
echo "[$(date)] Logs: $LOG_DIR/server.log"

# Verify server is up after a few seconds
sleep 3
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "[$(date)] ✅ Server is running on port 5001"
  echo "[$(date)] Services: Bhagwatham OCR, Instagram, Temple Discovery, Shlok Indexer"
else
  echo "[$(date)] ❌ Server failed to start. Check $LOG_DIR/server.log"
  exit 1
fi
