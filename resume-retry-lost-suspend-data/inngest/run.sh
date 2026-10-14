#!/bin/sh
# Private Inngest dev server on PORT..PORT+3, then the driver. Stops the server at the end.
PORT=${PORT:-9091}
DO_NOT_TRACK=1 npx --yes inngest-cli@1.46.0 dev --host 127.0.0.1 --port $PORT --connect-gateway-port $((PORT + 1)) \
  --connect-gateway-grpc-port $((PORT + 2)) --connect-executor-grpc-port $((PORT + 3)) --no-discovery --no-poll > inngest.log 2>&1 &
INNGEST_PID=$!
trap 'kill $INNGEST_PID' EXIT
until curl -s -m 2 "http://127.0.0.1:$PORT/health" > /dev/null; do sleep 1; done
INNGEST_URL="http://127.0.0.1:$PORT" ./node_modules/.bin/tsx driver.ts
