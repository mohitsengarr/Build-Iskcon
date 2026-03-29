#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
QA_DIR="$SCRIPT_DIR"
RUN_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_DIR="$QA_DIR/results/$(date -u +%Y-%m-%d_%H-%M)"

mkdir -p "$RUN_DIR"

echo "[$RUN_TS] QA hourly run starting..."

# Run Playwright tests
cd "$REPO_ROOT"
npx playwright test \
  --config qa/playwright.config.ts \
  --reporter=json \
  --output "$RUN_DIR/artifacts" \
  > "$RUN_DIR/results.json" 2>&1 || true

# Copy screenshots if any
if [ -d "$QA_DIR/results/artifacts" ]; then
  cp -r "$QA_DIR/results/artifacts/"*.png "$QA_DIR/screenshots/" 2>/dev/null || true
fi

echo "[$RUN_TS] Tests complete. Results in $RUN_DIR"
echo "[$RUN_TS] Review qa/qa_report.md for summary."
