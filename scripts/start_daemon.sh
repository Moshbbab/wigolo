#!/usr/bin/env bash
# scripts/start_daemon.sh
# Starts (or restarts) the Wigolo HTTP daemon for benchmark testing.
# Idempotent: kills any existing daemon on the port first, then starts fresh.

set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${WIGOLO_DAEMON_PORT:-7878}"
LOG="${WIGOLO_DAEMON_LOG:-/tmp/wigolo-daemon.log}"
PIDFILE="/tmp/wigolo-daemon.pid"

# Kill anything on the port (the daemon, or stale leftovers)
if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  echo "[start_daemon] killing existing process on :$PORT"
  lsof -ti tcp:"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 0.3
fi

# Also kill any process matching the daemon script name (belt + suspenders)
pkill -9 -f "scripts/daemon.mjs" 2>/dev/null || true
sleep 0.2

# Start fresh
echo "[start_daemon] starting on :$PORT (log: $LOG)"
WIGOLO_DAEMON_PORT="$PORT" nohup node scripts/daemon.mjs > "$LOG" 2>&1 &
echo $! > "$PIDFILE"

# Wait for health
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "[start_daemon] healthy (pid $(cat $PIDFILE))"
    curl -s "http://127.0.0.1:$PORT/health" | (command -v jq >/dev/null && jq . || cat)
    exit 0
  fi
  sleep 0.2
done

echo "[start_daemon] FAILED to start within 6s — check $LOG" >&2
tail -20 "$LOG" >&2 || true
exit 1
