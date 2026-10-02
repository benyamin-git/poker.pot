#!/usr/bin/env bash
# Start the live server (built UI + API) in the background.
set -euo pipefail

PORT="${LIVE_SERVER_PORT:-7403}"
HOST="0.0.0.0"
LOG="/tmp/poker.pot-liveserver.log"
PIDFILE="/tmp/poker.pot-liveserver.pid"

cd "$(dirname "$0")/.."

if ss -H -ltn "sport = :$PORT" | grep -q .; then
  echo "Port $PORT is already in use. Stop that process or set LIVE_SERVER_PORT." >&2
  exit 1
fi

if [ ! -f dist/index.html ]; then
  echo "dist/ not found, building..."
  bun run build
fi

PORT="$PORT" nohup bun src/server/index.ts >"$LOG" 2>&1 &
PID=$!
echo "$PID" >"$PIDFILE"

echo "Live server on http://$HOST:$PORT"
echo "Log:  $LOG"
echo "Stop: kill \$(cat $PIDFILE)"
