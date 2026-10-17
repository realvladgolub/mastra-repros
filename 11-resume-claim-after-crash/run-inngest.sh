#!/bin/sh
# Inngest variant. Needs DATABASE_URL pointing at an EMPTY Postgres database and the inngest CLI
# (INNGEST_BIN, default: npx inngest-cli@1.46.0). Inngest dev runs on 127.0.0.1 with DO_NOT_TRACK=1.
# Takes about 3 to 6 minutes: Inngest dev notices the killed request after about 2 minutes.
set -u
cd "$(dirname "$0")"
PORT="${PORT:-12488}"
INNGEST_BIN="${INNGEST_BIN:-npx --yes inngest-cli@1.46.0}"
export OUT="${OUT:-$PWD/out-inngest}"
rm -rf "$OUT"; mkdir -p "$OUT"
DO_NOT_TRACK=1 $INNGEST_BIN dev --host 127.0.0.1 --port "$PORT" --connect-gateway-port $((PORT + 1)) \
  --connect-gateway-grpc-port $((PORT + 2)) --connect-executor-grpc-port $((PORT + 3)) --no-discovery --no-poll \
  > "$OUT/inngest.log" 2>&1 &
INNGEST_PID=$!
trap 'kill $INNGEST_PID 2>/dev/null' EXIT
for _ in $(seq 1 60); do curl -s -m 2 "http://127.0.0.1:$PORT/health" > /dev/null && break; sleep 1; done
INNGEST_URL="http://127.0.0.1:$PORT" ROLE=driver ./node_modules/.bin/tsx driver-inngest.ts
