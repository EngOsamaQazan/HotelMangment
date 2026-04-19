"use client";

import { useEffect } from "react";

/**
 * On mobile browsers (Safari iOS, Chrome Android) the page is often restored
 * from the back/forward cache (bfcache) with its full in-memory React state,
 * which means the user sees yesterday's data even though the CSS/JS was
 * updated. `Cache-Control: no-store` is NOT honored by bfcache.
 *
 * We handle two cases:
 *
 *  1. `pageshow` with `persisted: true` — the browser restored the page from
 *     bfcache. Force a clean reload so fresh data is fetched.
 *  2. `visibilitychange` — if the tab was hidden for more than 15 minutes and
 *     then became visible, reload. Covers the common mobile pattern of
 *     switching to another app and coming back hours later.
 */
export function BFCacheBuster() {
  useEffect(() => {
    const STALE_AFTER_MS = 15 * 60 * 1000;
    let hiddenAt: number | null = null;

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        window.location.reload();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (
        document.visibilityState === "visible" &&
        hiddenAt !== null &&
        Date.now() - hiddenAt > STALE_AFTER_MS
      ) {
        hiddenAt = null;
        window.location.reload();
      }
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
