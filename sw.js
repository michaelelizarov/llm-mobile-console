/* Unchained service worker — caches ONLY the app shell, never API calls.
 * Bumped automatically at build time so a new deployment triggers the in-app update prompt.
 * App version: 1.0.0 · build: 2ca28c161801 */
const CACHE = 'abli-chat-2ca28c161801';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // index.html is required; the manifest is optional.
    await cache.addAll(['./', './index.html']);
    try { await cache.add('./manifest.webmanifest'); } catch (e) { /* optional */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('abli-chat-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Same-origin app shell only. Anything else (the API, relays, CDNs) goes straight to the network.
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scope)) return;
  const rel = url.pathname.slice(scope.length);
  if (rel !== '' && rel !== 'index.html' && rel !== 'manifest.webmanifest') return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(rel === '' ? './' : './' + rel);
    if (cached) {
      // Serve the shell instantly; refresh in the background (stale-while-revalidate).
      event.waitUntil(fetch(req).then((res) => { if (res && res.ok) cache.put(rel === '' ? './' : './' + rel, res.clone()); }).catch(() => {}));
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(rel === '' ? './' : './' + rel, res.clone());
      return res;
    } catch (e) {
      const fallback = await cache.match('./index.html');
      return fallback || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});
