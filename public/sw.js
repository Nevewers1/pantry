/* Pantry service worker — SELF-DESTRUCT / KILL SWITCH.
 *
 * A previous version cached page HTML too aggressively, which caused blank
 * pages after each deploy. Offline support isn't needed until a later stage,
 * so this worker now does one thing: on activation it deletes every cache,
 * unregisters itself, and reloads any open pages so they load fresh from the
 * network. Browsers that still have the old worker will pick THIS file up on
 * their next visit and clean themselves up automatically — no manual reset.
 *
 * When we reintroduce proper offline support (Step 8) it will use versioned,
 * network-first caching so this can't recur.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
