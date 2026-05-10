// SurfCall Service Worker
// Strategy:
//   - App shell (index.html): cache-first, background revalidate
//   - API calls (/all, /forecast, etc.): network-first, cache fallback
//   - Offline: serve stale cache and post message to page to show stale banner

const CACHE_NAME   = 'surfcall-v2';
const SHELL_URL    = '/surf-sesh/';
const API_PATTERNS = ['/all', '/forecast', '/swell', '/tides', '/conditions'];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(SHELL_URL))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // API calls — network-first, cache fallback
  const isApi = API_PATTERNS.some(p => url.pathname.endsWith(p));
  if (isApi) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // App shell (HTML navigation) — cache-first, revalidate in background
  if (request.mode === 'navigate' || url.pathname === '/surf-sesh/' || url.pathname === '/surf-sesh/index.html') {
    event.respondWith(cacheFirstWithRevalidate(request));
    return;
  }

  // Everything else — network only (icons, external resources)
  // Let pass through without intercepting
});

// Network-first: try network, fall back to cache, post stale message if offline
async function networkFirstWithFallback(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      // Tell the page it's seeing stale data
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(c => c.postMessage({ type: 'STALE_DATA' }));
      return cached;
    }
    // Nothing cached — return a minimal error JSON so the app can handle it
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Cache-first: serve shell from cache instantly, revalidate in background
async function cacheFirstWithRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request.clone())
    .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return cached || fetchPromise;
}
