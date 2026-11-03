// SQLite-backed stand-in for the Cloudflare KV namespace `PUSH_SUBSCRIPTIONS`.
// Implements exactly the subset of the KV API the Worker uses, so surf-core.mjs
// runs unchanged:
//   • get(key, 'json')            → parsed JSON (or null); any other type → string
//   • put(key, valueString)       → upsert
//   • delete(key)                 → remove
//   • list({ prefix, cursor })    → { keys:[{name}], list_complete, cursor }
//     list() with no args         → every key (used by the hourly cron)
//
// One flat table `kv(key, value)` holds push subs (hash keys), sessions (sess:)
// and user accounts (usr:) — the same single-namespace layout as on Cloudflare.
// better-sqlite3 is synchronous; the methods are async to match the KV contract
// the Worker awaits.

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class SqliteKV {
  constructor(dbPath) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');   // concurrent reads during writes
    this.db.pragma('synchronous = NORMAL');
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this._get = this.db.prepare('SELECT value FROM kv WHERE key = ?');
    this._put = this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    this._del = this.db.prepare('DELETE FROM kv WHERE key = ?');
    this._allKeys = this.db.prepare('SELECT key FROM kv ORDER BY key');
    this._prefixKeys = this.db.prepare("SELECT key FROM kv WHERE key LIKE ? ESCAPE '\\' ORDER BY key");
  }

  async get(key, type) {
    const row = this._get.get(key);
    if (!row) return null;
    if (type === 'json') { try { return JSON.parse(row.value); } catch { return null; } }
    return row.value;
  }

  async put(key, value) {
    this._put.run(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  async delete(key) {
    this._del.run(key);
  }

  // Returns every matching key in one page (list_complete: true). The Worker's
  // cursor loop therefore terminates after a single call — correct for our scale
  // (hundreds of keys), and simpler than emulating KV's 1000-key pagination.
  async list(opts = {}) {
    const prefix = opts && opts.prefix;
    const rows = prefix
      ? this._prefixKeys.all(escapeLike(prefix) + '%')
      : this._allKeys.all();
    return { keys: rows.map(r => ({ name: r.key })), list_complete: true, cursor: undefined };
  }

  close() { this.db.close(); }
}

// Escape LIKE wildcards in a literal prefix (our prefixes are 'sess:'/'usr:' —
// no wildcards today, but be safe).
function escapeLike(s) { return String(s).replace(/[\\%_]/g, c => '\\' + c); }
