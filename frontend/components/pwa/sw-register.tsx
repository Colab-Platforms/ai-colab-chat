"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // In development the SW's stale-while-revalidate cache serves Next's dev
    // chunks (whose URLs are stable, unlike hashed production assets) from a
    // cache that never invalidates - so edits appear not to take effect. Tear
    // down any SW a previous dev/prod visit left behind instead of registering.
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
        .then(() =>
          typeof caches !== "undefined"
            ? caches
                .keys()
                .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            : undefined,
        )
        .catch(() => {
          // Nothing to clean up, or storage is unavailable - ignore.
        });
      return;
    }

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.error("SW registration failed:", err));
    });
  }, []);

  return null;
}
