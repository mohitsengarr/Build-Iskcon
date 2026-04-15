#!/bin/bash
# Stop Build-ISKCON server and all services
set -euo pipefail

PROJECT_DIR="/Users/mohitsengarr/Documents/Code/Sengar/Build-Iskcon"
PID_FILE="$PROJECT_DIR/logs/server.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[$(date)] Stopping server (PID $PID)..."
    kill "$PID"
    sleep 2
    kill -9 "$PID" 2>/dev/null || true
    echo "[$(date)] ✅ Server stopped"
  else
    echo "[$(date)] Server not running (stale PID file)"
  fi
  rm -f "$PID_FILE"
else
  echo "[$(date)] No PID file found"
fi

# Kill any remaining processes
pkill -f "tsx.*api-server.*src/index.ts" 2>/dev/null || true
echo "[$(date)] Cleaned up any remaining processes"
