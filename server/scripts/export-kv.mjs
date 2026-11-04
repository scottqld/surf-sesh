// Export the whole Cloudflare KV namespace to kv-dump.json, for import into the
// NAS SQLite store. Run on the machine where wrangler is authenticated:
//
//   node scripts/export-kv.mjs                 # all keys
//   node scripts/export-kv.mjs --prefix sess:  # just sessions, etc.
//
// Output: server/kv-dump.json  = [{ key, value }]  (value is the raw string)
//
// Keys are: push subs (16-hex), sessions (sess:*), accounts (usr:*). For the
// cutover you typically want sess:* and usr:* — push subs become stale once the
// VAPID keypair changes, so devices re-subscribe anyway.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const NS_ID = process.env.KV_NAMESPACE_ID || '900c639eff2542bdbe53adafd29d3325';
const prefixArg = process.argv.indexOf('--prefix');
const prefix = prefixArg > -1 ? process.argv[prefixArg + 1] : null;

// worker/ holds the wrangler project (config + auth cache). wrangler is only
// available via npx here, so shell out (execSync) rather than execFile — this
// also resolves npx.cmd on Windows. Keys never contain double quotes (they are
// sess:<id> / usr:<name> / 16-hex), so double-quoting is safe for spaces.
const here = dirname(fileURLToPath(import.meta.url));
const workerDir = join(here, '..', '..', 'worker');
const q = (s) => `"${String(s).replace(/"/g, '')}"`;
const wrangler = (argStr) =>
  execSync(`npx wrangler ${argStr}`, { cwd: workerDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

console.log(`[export] listing keys (ns ${NS_ID})${prefix ? ` prefix="${prefix}"` : ''} …`);
let listCmd = `kv key list --namespace-id ${NS_ID} --remote`;
if (prefix) listCmd += ` --prefix ${q(prefix)}`;
const keys = JSON.parse(wrangler(listCmd)).map(k => k.name);
console.log(`[export] ${keys.length} keys. Fetching values …`);

const out = [];
for (let i = 0; i < keys.length; i++) {
  const key = keys[i];
  const value = wrangler(`kv key get ${q(key)} --namespace-id ${NS_ID} --remote`);
  out.push({ key, value });
  if ((i + 1) % 25 === 0 || i === keys.length - 1) console.log(`[export]   ${i + 1}/${keys.length}`);
}

const dest = join(here, '..', 'kv-dump.json');
writeFileSync(dest, JSON.stringify(out, null, 0));
console.log(`[export] wrote ${out.length} records → ${dest}`);
