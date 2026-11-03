// Local smoke test of the ported Worker logic, using an in-memory KV (so it runs
// without better-sqlite3). Exercises CORS, auth (register/login), the token-gated
// session upsert + read, push subscribe, and a no-op cron. Not a unit suite —
// just a fast end-to-end sanity check that the port wired up correctly.
import { webcrypto as crypto } from 'node:crypto';
import { handleFetch, handleCron } from '../src/surf-core.mjs';

// Minimal Cloudflare-KV-compatible in-memory store.
class MapKV {
  constructor() { this.m = new Map(); }
  async get(k, t) { const v = this.m.get(k); if (v == null) return null; return t === 'json' ? JSON.parse(v) : v; }
  async put(k, v) { this.m.set(k, typeof v === 'string' ? v : JSON.stringify(v)); }
  async delete(k) { this.m.delete(k); }
  async list(o = {}) {
    const keys = [...this.m.keys()].filter(k => !o.prefix || k.startsWith(o.prefix)).map(name => ({ name }));
    return { keys, list_complete: true };
  }
}

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const env = {
  PUSH_SUBSCRIPTIONS: new MapKV(),
  AUTH_SECRET: b64u(crypto.getRandomValues(new Uint8Array(32))),
  GROUP_PASSCODE: '9344',
  VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY_JWK: '', ANTHROPIC_API_KEY: '',
};

let pass = 0, fail = 0;
const req = (path, opts = {}) => handleFetch(new Request('http://api' + path, opts), env);
const J = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
async function check(name, res, want) {
  const body = await res.clone().json().catch(() => ({}));
  const ok = want(res.status, body);
  console.log(`${ok ? '✓' : '✗'} ${name}  [${res.status}] ${JSON.stringify(body).slice(0, 90)}`);
  ok ? pass++ : fail++;
  return body;
}

// 1. CORS preflight
await check('OPTIONS /sessions', await req('/sessions', { method: 'OPTIONS' }),
  (s, _b) => s === 200);

// 2. register with wrong code → 401
await check('register bad code', await req('/auth/register', J({ code: '0000', name: 'Testy', pin: '1234' })),
  (s) => s === 401);

// 3. register valid → token
const reg = await check('register ok', await req('/auth/register', J({ code: '9344', name: 'Testy', pin: '1234' })),
  (s, b) => s === 200 && b.ok && typeof b.token === 'string' && b.token.length > 10);
const token = reg.token;

// 4. duplicate name → 409
await check('register dup', await req('/auth/register', J({ code: '9344', name: 'testy', pin: '9999' })),
  (s) => s === 409);

// 5. login wrong pin → 401
await check('login bad pin', await req('/auth/login', J({ name: 'Testy', pin: '0000' })),
  (s) => s === 401);

// 6. login ok → token
await check('login ok', await req('/auth/login', J({ name: 'Testy', pin: '1234' })),
  (s, b) => s === 200 && b.ok && b.name === 'Testy' && b.token);

// 7. session POST without token → 401
await check('sessions no token', await req('/sessions', J([{ id: 's1', myScore: 7, updatedAt: 1 }])),
  (s) => s === 401);

// 8. session POST with token → stored, user stamped
await check('sessions upsert', await req('/sessions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-surfsesh-token': token },
  body: JSON.stringify([{ id: 's1', myScore: 7, user: 'HACKER', updatedAt: 10 }]),
}), (s, b) => s === 200 && b.ok && b.count === 1);

// 9. session GET → record present, author overridden to token name
await check('sessions read', await req('/sessions', { method: 'GET' }),
  (s, b) => s === 200 && b.sessions.length === 1 && b.sessions[0].user === 'Testy');

// 10. stale upsert (older updatedAt) is skipped — no write, count 0, value unchanged
await check('sessions stale skip', await req('/sessions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-surfsesh-token': token },
  body: JSON.stringify([{ id: 's1', myScore: 1, updatedAt: 5 }]),
}), (s, b) => s === 200 && b.count === 0);
const afterStale = await (await req('/sessions', { method: 'GET' })).json();
console.log(`${afterStale.sessions[0].myScore === 7 ? '✓' : '✗'} stale left value intact (myScore=${afterStale.sessions[0].myScore})`);
afterStale.sessions[0].myScore === 7 ? pass++ : fail++;

// 11. subscribe stores a sub (keyed by endpoint hash), excluded from session list.
// Use a push hour that is NOT the current Brisbane hour so the cron below no-ops.
const brisHour = new Date(Date.now() + 10 * 3600000).getUTCHours();
const notDue = (brisHour + 3) % 24;
await check('subscribe', await req('/subscribe', J({ subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'x', auth: 'y' } }, preferredHour: notDue })),
  (s, b) => s === 200 && b.ok);
const sessAfter = await (await req('/sessions', { method: 'GET' })).json();
console.log(`${sessAfter.sessions.length === 1 ? '✓' : '✗'} sub excluded from /sessions (count=${sessAfter.sessions.length})`);
sessAfter.sessions.length === 1 ? pass++ : fail++;

// 12. cron with no due subs at this hour is a safe no-op
try { await handleCron(env); console.log('✓ cron ran without throwing'); pass++; }
catch (e) { console.log('✗ cron threw:', e.message); fail++; }

// 13. unknown endpoint → 404
await check('unknown route', await req('/nope'), (s) => s === 404);

console.log(`\n${fail ? '❌' : '✅'} smoke: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
