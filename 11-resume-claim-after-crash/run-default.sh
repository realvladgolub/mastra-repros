#!/bin/sh
# Default engine. Needs DATABASE_URL pointing at an EMPTY Postgres database (Mastra creates its tables).
set -u
cd "$(dirname "$0")"
export OUT="${OUT:-$PWD/out-default}"
rm -rf "$OUT"
TSX=./node_modules/.bin/tsx
ROLE=first HANG_ROLE=first $TSX default-engine.ts
ROLE=second HANG_ROLE=none $TSX default-engine.ts
ROLE=third HANG_ROLE=none $TSX default-engine.ts
