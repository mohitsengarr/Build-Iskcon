#!/bin/bash
# Health check — restarts server if it's down
# Called by LaunchAgent watchdog every 5 minutes

PROJECT_DIR="/Users/mohitsengarr/Documents/Code/Sengar/Build-Iskcon"
LOG_DIR="$PROJECT_DIR/logs"
PID_FILE="$LOG_DIR/server.pid"

export PATH="/Users/mohitsengarr/.nvm/versions/node/v20.17.0/bin:$PATH"

# Check if server responds on port 5001
if curl -sf http://localhost:5001/api/bhagwatham/progress > /dev/null 2>&1; then
  # Server is healthy — nothing to do
  exit 0
fi

echo "[$(date)] ⚠️ Server not responding, restarting..." >> "$LOG_DIR/health-check.log"

# Kill any zombie processes
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  kill -9 "$OLD_PID" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
pkill -f "tsx.*api-server.*src/index.ts" 2>/dev/null || true
sleep 1

# Restart
"$PROJECT_DIR/scripts/start-services.sh" >> "$LOG_DIR/health-check.log" 2>&1
echo "[$(date)] ✅ Server restarted" >> "$LOG_DIR/health-check.log"
