/* AIM PWA static-asset service worker.
 *
 * Privacy/integrity boundary:
 * - never intercept /api/*;
 * - never cache navigations, authenticated pages, medicine data, patient data,
 *   inventory data, reservations, or mutation responses;
 * - cache only versioned Next static assets plus public manifest/icon assets.
 */
const CACHE_PREFIX = 'aim-public-static-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const PUBLIC_SHELL_ASSETS = new Set(['/manifest.webmanifest', '/icon.svg']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([...PUBLIC_SHELL_ASSETS])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isVersionedStaticAsset = url.pathname.startsWith('/_next/static/');
  const isPublicShellAsset = PUBLIC_SHELL_ASSETS.has(url.pathname);
  if (!isVersionedStaticAsset && !isPublicShellAsset) return;

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}
