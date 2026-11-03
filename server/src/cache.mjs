// In-memory TTL cache shim standing in for Cloudflare's `caches.default`.
// The Worker only uses two methods, both via fetchWithCache():
//   • cache.match(request)        → a Response (or undefined when missing/stale)
//   • cache.put(request, response) → store it
// Keys are Request objects; we index by their URL. Entries expire after
// CACHE_TTL seconds (matching the Worker's Cache-Control max-age), so upstream
// BOM/Qld/Open-Meteo calls are coalesced exactly as before. Process-local, which
// is fine: a single API container serves everyone, same as one Worker isolate.

const TTL_MS = 1800 * 1000; // 30 min, mirrors CACHE_TTL in surf-core.mjs

class MemCache {
  constructor() { this._store = new Map(); } // url -> { body:string, exp:number }

  async match(request) {
    const key = typeof request === 'string' ? request : request.url;
    const hit = this._store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.exp) { this._store.delete(key); return undefined; }
    // Return a fresh Response each time so the body can be read (bodies are
    // single-use); fetchWithCache calls .json() on it.
    return new Response(hit.body, { headers: { 'Content-Type': 'application/json' } });
  }

  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url;
    const body = await response.clone().text();
    this._store.set(key, { body, exp: Date.now() + TTL_MS });
  }
}

export const caches = { default: new MemCache() };
