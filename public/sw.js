/* Pantry service worker — installable PWA with safe caching.
 *
 * Strategy (revised to avoid stale-HTML-after-deploy blank screens):
 *  - Page navigations (HTML): NETWORK-FIRST. Always fetch the live page when
 *    online so a new deploy is picked up immediately; fall back to the last
 *    cached page only when the network is unavailable (in-store bad signal).
 *  - Static assets (JS/CSS/icons): stale-while-revalidate for speed.
 *  - Supabase / cross-origin / auth requests: never intercepted.
 *
 * Bump CACHE when changing this file so old caches are purged on activate.
 */
const CACHE = "pantry-shell-v2";
const PRECACHE = ["/manifest.json", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
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
  if (url.origin !== self.location.origin) return; // leave Supabase etc. alone
  if (url.pathname.startsWith("/auth")) return;

  const isNavigation =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isNavigation) {
    // Network-first: fresh page when online, cached page only as offline fallback.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/");
        })
    );
    return;
  }

  // Static assets: stale-while-revalidate.
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
