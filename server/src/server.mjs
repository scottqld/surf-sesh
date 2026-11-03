// SurfSesh NAS backend — HTTP server + hourly scheduler.
// Bridges Node's http server to the ported Worker handler (handleFetch), and
// fires handleCron() at the top of every hour (the Worker's `0 * * * *` cron).
//
// `env` mirrors the Worker's env: the KV binding is our SQLite shim, the rest are
// plain secrets/vars from the environment. Serving the static PWA and TLS are
// nginx's job (reverse proxy) — this process is the API only.

import http from 'node:http';
import { handleFetch, handleCron } from './surf-core.mjs';
import { SqliteKV } from './kv-sqlite.mjs';

const PORT    = Number(process.env.PORT) || 8096;
const DB_PATH = process.env.DB_PATH || '/data/surfsesh.db';

const kv = new SqliteKV(DB_PATH);

const env = {
  PUSH_SUBSCRIPTIONS:    kv,                               // SQLite KV shim
  VAPID_PUBLIC_KEY:      process.env.VAPID_PUBLIC_KEY      || '',
  VAPID_PRIVATE_KEY_JWK: process.env.VAPID_PRIVATE_KEY_JWK || '',
  AUTH_SECRET:           process.env.AUTH_SECRET           || '',
  GROUP_PASSCODE:        process.env.GROUP_PASSCODE        || '',
  ANTHROPIC_API_KEY:     process.env.ANTHROPIC_API_KEY     || '',
};

// Startup sanity — warn (don't crash) so a half-configured box still serves reads.
for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY_JWK', 'AUTH_SECRET', 'GROUP_PASSCODE']) {
  if (!env[k]) console.warn(`[surfsesh] WARNING: ${k} is not set — related feature disabled.`);
}
if (!env.ANTHROPIC_API_KEY) console.warn('[surfsesh] note: ANTHROPIC_API_KEY unset — push/AI text falls back to plain summaries.');

// ─── Node http  →  Web Request/Response bridge ───────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // Liveness probe for Docker / nginx — never touches surf-core.
    if (req.url === '/health' || req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ts: Date.now() }));
      return;
    }

    const hasBody = !(req.method === 'GET' || req.method === 'HEAD');
    const bodyBuf = hasBody ? await readBody(req) : null;

    const request = new Request(`http://api${req.url}`, {
      method:  req.method,
      headers: req.headers,
      body:    bodyBuf && bodyBuf.length ? bodyBuf : undefined,
    });

    const response = await handleFetch(request, env);
    const headers = {};
    response.headers.forEach((v, k) => { headers[k] = v; });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error('[surfsesh] request error:', e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
});

server.listen(PORT, () => console.log(`[surfsesh] API listening on :${PORT} (db ${DB_PATH})`));

// ─── Hourly scheduler (replaces the Cloudflare cron "0 * * * *") ─────────────
// Fire at minute 0 of each hour. The cron logic is TZ-independent (it derives
// Brisbane time from Date.now()+10h internally), so wall-clock hour boundaries
// are correct regardless of the container timezone.
function msToNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(now.getHours() + 1);
  return next - now;
}
async function runCron() {
  const t0 = Date.now();
  try {
    await handleCron(env);
    console.log(`[surfsesh] cron ok (${Date.now() - t0}ms)`);
  } catch (e) {
    console.error('[surfsesh] cron error:', e);
  }
}
setTimeout(() => { runCron(); setInterval(runCron, 60 * 60 * 1000); }, msToNextHour());
console.log(`[surfsesh] first cron in ${Math.round(msToNextHour() / 60000)} min`);

// ─── Graceful shutdown ───────────────────────────────────────────────────────
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[surfsesh] ${sig} — shutting down`);
    server.close(() => { kv.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
