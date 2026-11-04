#!/usr/bin/env bash
# Build the NAS-repointed static PWA from the repo root into server/site-build/,
# ready to copy to /Volume2/files/apps/surfsesh/site/ and serve at
# https://nas.tail147fa0.ts.net/surf-sesh/.
#
# Repoints the backend (Cloudflare Worker → NAS API) and swaps the VAPID public
# key. Base paths stay /surf-sesh/, so nothing else changes. The repo's own
# index.html is left untouched, so GitHub Pages keeps serving the Cloudflare
# version during the transition until the Worker is decommissioned.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/server/site-build"

OLD_VAPID='BCb7XtE1ipTeb_yJArg29xPCwJXQnnREgfLyGt47MiYnUniKWZxonlQmwJwWWRcQ3Wpqnz_pS7ZFEiAbBrgXiu8'
NEW_VAPID='BGUwxhO4NBmIhvVpLYCF4D37nCQqePFmjihpvq-nWYmvZH8sbnhDklBFAaNk2o2RW--DaRmcXm7CTgNsNYiIOS0'

rm -rf "$OUT"; mkdir -p "$OUT"
cp "$ROOT"/sw.js "$ROOT"/manifest.json "$ROOT"/icon-192.png "$ROOT"/icon-512.png "$OUT/"
# Same-origin relative API so ONE build works both ways: served from
# nas.tail147fa0.ts.net it calls that /api (full PWA), served from a LAN
# .moonbeam name over http it calls that /api (plain web page). nginx proxies
# /api/ → the API container in both cases. Also swap the VAPID public key.
sed \
  -e "s#const WORKER_URL = 'https://surf-worker.scottsurf.workers.dev';#const WORKER_URL = window.location.origin + '/api';#" \
  -e "s#'https://surf-worker.scottsurf.workers.dev/ai'#WORKER_URL + '/ai'#" \
  -e "s#${OLD_VAPID}#${NEW_VAPID}#g" \
  "$ROOT/index.html" > "$OUT/index.html"

echo "built -> $OUT"
ls -la "$OUT"
echo "worker literals left (want 0):   $(grep -c 'surf-worker.scottsurf.workers.dev' "$OUT/index.html" || true)"
echo "origin-relative WORKER_URL (1):  $(grep -c \"window.location.origin + '/api'\" "$OUT/index.html" || true)"
echo "new VAPID present (want 1):      $(grep -c "$NEW_VAPID" "$OUT/index.html" || true)"
