#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm run lint
pnpm run check:legacy-tokens
pnpm run check:overlay-z-index
pnpm run typecheck
pnpm run test:unit
pnpm run build

BASE_URL="${PLAYWRIGHT_BASE_URL:-http://localhost:3000}"
if ! curl -sf --max-time 5 "$BASE_URL" >/dev/null; then
  cat >&2 <<EOF
[verify] Cannot reach PLAYWRIGHT_BASE_URL ($BASE_URL).

Playwright globalSetup runs before the config webServer starts, so the Next.js
dev server must already be running before browser tests:

  pnpm run dev

Then re-run: pnpm run verify
EOF
  exit 1
fi

pnpm run test:browser
echo "All verification gates passed."
