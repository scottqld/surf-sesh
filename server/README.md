# SurfSesh API (NAS)

NAS port of the Cloudflare Worker. Same endpoints and behaviour; the only
Cloudflare-specific bits are swapped behind identical interfaces, so the surf
scoring, auth, push and cron logic in `src/surf-core.mjs` is the Worker's code
verbatim:

| Cloudflare | NAS replacement |
|---|---|
| KV namespace `PUSH_SUBSCRIPTIONS` | `src/kv-sqlite.mjs` — SQLite (`/data/surfsesh.db`) |
| `caches.default` (Cache API) | `src/cache.mjs` — in-memory TTL cache |
| cron trigger `0 * * * *` | hourly scheduler in `src/server.mjs` |
| secrets (`wrangler secret`) | `.env` (git-ignored) |

Endpoints (unchanged): `GET /forecast /tides /swell /all`, `POST /ai`,
`POST|DELETE /subscribe`, `POST /auth/check|register|login`, `GET|POST /sessions`,
plus `GET /health`. CORS and the `x-surfsesh-token` session gate are identical.

Runs as the **API only**. nginx (host) terminates TLS, serves the static PWA, and
reverse-proxies `/api/*` here.

## Layout on the NAS
Per the storage guidelines, everything lives under `/Volume2/files/apps/surfsesh/`:
```
/Volume2/files/apps/surfsesh/
  server/            # this directory (source + Dockerfile + compose)
  server/data/       # surfsesh.db (bind-mounted; survives rebuilds)
  site/              # the static PWA (index.html, sw.js, manifest.json, icons)
```

## One-time setup

1. **Keys & secrets** — generate a fresh VAPID keypair + auth secret:
   ```bash
   npm install            # builds better-sqlite3 (needs node 20/22 + toolchain; the Docker image handles this)
   npm run gen-keys
   ```
   Copy `.env.example` → `.env` and paste in the printed `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY_JWK`, `AUTH_SECRET`. Set `GROUP_PASSCODE=9344` and, if you
   want AI push text, `ANTHROPIC_API_KEY`. Also paste the **public** key into
   `index.html`'s `VAPID_PUBLIC_KEY` const (clients subscribe against it).

   > The Cloudflare originals can't be read back, so these are new. Consequence:
   > every device re-enables notifications once, and everyone re-logs-in once with
   > their existing name + PIN. Session logs and accounts migrate intact (below).

2. **Migrate data from Cloudflare KV** — on the machine where `wrangler` is signed in:
   ```bash
   node scripts/export-kv.mjs --prefix sess:   # sessions
   node scripts/export-kv.mjs --prefix usr:    # append accounts (re-run merges)
   # or: node scripts/export-kv.mjs            # everything (incl. stale push subs)
   ```
   This writes `kv-dump.json`. Then load it into SQLite (on the NAS, or locally to
   produce the db file and copy it up):
   ```bash
   node scripts/import-kv.mjs --only sess:,usr:
   ```

3. **Run it**:
   ```bash
   docker compose up -d --build
   curl -s localhost:8096/health         # {"ok":true,...}
   curl -s localhost:8096/sessions | head # migrated log
   ```

## nginx (host) — sketch
```nginx
location /api/ { proxy_pass http://127.0.0.1:8096/; }   # trailing slash strips /api
location /     { root /Volume2/files/apps/surfsesh/site; try_files $uri $uri/ /index.html; }
```
The client's `WORKER_URL` becomes `https://<your-domain>/api` at cutover.

## Verify / tests
```bash
node scripts/smoke.mjs     # end-to-end logic check (in-memory KV, no build needed)
npm run check              # syntax-check every file
```

## Notes
- The scheduler fires at minute 0 of each hour. The cron logic derives Brisbane
  time from `Date.now()+10h` internally, so it's timezone-independent (compose
  pins `TZ=UTC` anyway).
- `data/` is bind-mounted, so the SQLite DB (and its `-wal`/`-shm`) persist across
  `docker compose up --build`.
- Keep `src/surf-core.mjs` in sync with the Worker's scoring/BREAKS if the app's
  model changes (it mirrors `index.html`).
