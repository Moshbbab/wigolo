#!/usr/bin/env bash
# scripts/stop_daemon.sh
# Stops the Wigolo HTTP daemon.

set -euo pipefail

PORT="${WIGOLO_DAEMON_PORT:-7878}"

if lsof -ti tcp:"$PORT" >/dev/null 2>&1; then
  lsof -ti tcp:"$PORT" | xargs kill -9 2>/dev/null || true
  echo "[stop_daemon] stopped"
else
  echo "[stop_daemon] nothing on :$PORT"
fi

pkill -9 -f "scripts/daemon.mjs" 2>/dev/null || true
rm -f /tmp/wigolo-daemon.pid
