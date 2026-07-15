"use client";

import { useEffect } from "react";

/** Registers the service worker so the app is installable and read-offline. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal — the app still works online.
      });
    }
  }, []);

  return null;
}
