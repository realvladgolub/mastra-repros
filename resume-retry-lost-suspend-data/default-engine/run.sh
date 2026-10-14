#!/bin/sh
rm -f runs.json
./node_modules/.bin/tsx repro.ts first
./node_modules/.bin/tsx repro.ts second
