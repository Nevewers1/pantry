"use client";

import { useEffect } from "react";

/**
 * Service worker is intentionally DISABLED for now (offline support returns in
 * a later stage with proper versioned caching). This component actively cleans
 * up any previously-installed worker + caches so no browser is left stuck on a
 * stale cached page. It does NOT register a new worker.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k)))
        .catch(() => {});
    }
  }, []);

  return null;
}
