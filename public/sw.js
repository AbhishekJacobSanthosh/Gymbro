// Service worker: keeps the app's own files on the phone so GymBro opens without signal.
// Supabase requests are never cached; the Today page keeps its data in localStorage instead.
// shortcut: hand-rolled cache with no build-time file list; switch to vite-plugin-pwa (Workbox) if caching needs grow.
const CACHE = 'gymbro-v1';
const NETWORK_TIMEOUT_MS = 3000; // weak gym signal: fall back to the cached app instead of a blank screen

// Caches index.html plus every file it references, and drops files from older builds
async function cacheAppShell(response) {
  const cache = await caches.open(CACHE);
  const html = await response.clone().text();
  const files = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(m => m[1]);
  await cache.put('/', response);
  await Promise.all(files.map(url => cache.add(url).catch(() => {})));
  for (const request of await cache.keys()) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/assets/') && !files.includes(path)) await cache.delete(request);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(fetch('/', { cache: 'no-store' }).then(res => res.ok && cacheAppShell(res)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
]);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Opening the app: newest version when online, cached app when offline or the signal is too weak
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await withTimeout(fetch(request));
        if (response.ok) event.waitUntil(cacheAppShell(response.clone()));
        return response;
      } catch {
        return (await caches.match('/')) || fetch(request);
      }
    })());
    return;
  }

  // Built files have a hash in their name and never change: cache first.
  // Everything else (icons, images): network first, cache as fallback.
  const hashed = url.pathname.startsWith('/assets/');
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached && hashed) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  })());
});
