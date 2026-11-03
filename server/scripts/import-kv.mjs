// Import kv-dump.json (from export-kv.mjs) into the NAS SQLite store.
//
//   node scripts/import-kv.mjs                     # import everything in the dump
//   node scripts/import-kv.mjs --only sess:,usr:   # only these prefixes
//   DB_PATH=/data/surfsesh.db node scripts/import-kv.mjs
//
// Idempotent upsert, so it's safe to re-run. By default it imports every record
// in the dump; use --only to bring across just sessions + accounts and leave
// push subscriptions behind (they're re-created when devices re-subscribe).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SqliteKV } from '../src/kv-sqlite.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(here, '..', 'data', 'surfsesh.db');
const dumpPath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : join(here, '..', 'kv-dump.json');

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1].split(',').map(s => s.trim()).filter(Boolean) : null;

const records = JSON.parse(readFileSync(dumpPath, 'utf8'));
const kept = only ? records.filter(r => only.some(p => r.key.startsWith(p))) : records;

const kv = new SqliteKV(DB_PATH);
let n = 0;
for (const { key, value } of kept) {
  // value is the raw KV string (already JSON); store verbatim.
  await kv.put(key, typeof value === 'string' ? value : JSON.stringify(value));
  n++;
}
kv.close();

const breakdown = kept.reduce((m, r) => {
  const p = r.key.startsWith('sess:') ? 'sess:' : r.key.startsWith('usr:') ? 'usr:' : 'subs';
  m[p] = (m[p] || 0) + 1; return m;
}, {});
console.log(`[import] ${n} records → ${DB_PATH}`, breakdown);
