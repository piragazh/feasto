#!/usr/bin/env bash
# Runs the finance engine tests against an in-memory database.
# Usage: bash scripts/finance/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
sed -e 's#^import { createClientFromRequest } from "npm:@base44/sdk@0.8.23";#import { createClientFromRequest } from "./mock.ts";#' \
    -e 's#^Deno.serve(#(globalThis as any).__serve = (#' \
    "$here/../../base44/functions/finance-operations/entry.ts" > "$here/.engine.ts"
status=0
for t in "$here"/*.test.ts; do
  echo "== $(basename "$t")"
  deno run --allow-read --allow-env "$t" 2>&1 | grep -v '^\[finance-operations\]' || status=1
done
rm -f "$here/.engine.ts"
exit $status
