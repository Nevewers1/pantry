/* Pantry service worker — minimal, offline-tolerant reads (Build Brief §6.11).
 *
 * Strategy:
 *  - App shell (navigations + static assets): stale-while-revalidate so the
 *    ledger and current list open instantly and even work on bad in-store
 *    signal, then refresh in the background.
 *  - Supabase API calls are NEVER cached here — auth + live data must be fresh.
 *    (Write queuing on reconnect is a Step-8 enhancement, not Step 1.)
 */
const CACHE = "pantry-shell-v1";
const SHELL = ["/", "/login", "/manifest.json", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept Supabase or other cross-origin API traffic.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/auth")) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
