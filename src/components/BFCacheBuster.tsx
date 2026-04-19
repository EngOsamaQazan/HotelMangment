"use client";

import { useEffect } from "react";

/**
 * Three-layer guard that keeps every device looking at live data.
 *
 * Layer 1 — bfcache restore
 *   Mobile browsers (Safari iOS, Chrome Android) may restore a page from the
 *   back/forward cache with its full in-memory React state. `Cache-Control:
 *   no-store` is ignored by bfcache. Listen for `pageshow` with
 *   `persisted: true` and force a reload.
 *
 * Layer 2 — stale foreground tab
 *   If the tab was hidden for more than 5 minutes and becomes visible again
 *   (user switched to another app and returned), reload to fetch fresh data.
 *
 * Layer 3 — new deployment detection
 *   Poll `/api/build-id` every 60s and on every visibility change. When the
 *   server's build id differs from the one captured on first load, the server
 *   was redeployed — force a reload so the device abandons its stale bundle
 *   instead of running yesterday's JavaScript forever.
 *
 * Layer 4 — force `cache: "no-store"` on every client-side API request
 *   Some mobile browsers ignore server `Cache-Control` headers and cache GET
 *   responses in their HTTP cache. Monkey-patch `window.fetch` so every
 *   request to `/api/*` explicitly asks for `no-store`. This is a belt-and-
 *   braces safety net; it doesn't change any existing caller's behaviour.
 */
export function BFCacheBuster() {
  useEffect(() => {
    const STALE_AFTER_MS = 5 * 60 * 1000;
    const BUILD_ID_POLL_MS = 60 * 1000;

    let hiddenAt: number | null = null;
    let initialBuildId: string | null = null;
    let reloading = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const reloadOnce = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reloadOnce();
    };

    const checkBuildId = async () => {
      try {
        const res = await fetch("/api/build-id", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        const buildId = data?.buildId;
        if (!buildId) return;
        if (initialBuildId === null) {
          initialBuildId = buildId;
          return;
        }
        if (initialBuildId !== buildId) reloadOnce();
      } catch {
        // offline or transient error — ignore
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (document.visibilityState !== "visible") return;

      if (hiddenAt !== null && Date.now() - hiddenAt > STALE_AFTER_MS) {
        hiddenAt = null;
        reloadOnce();
        return;
      }
      hiddenAt = null;
      void checkBuildId();
    };

    // Layer 4: patch fetch (idempotent — only patches once per page load).
    type FetchFn = typeof window.fetch;
    interface PatchMarker {
      __hotelNoStorePatched?: boolean;
    }
    const currentFetch = window.fetch as FetchFn & PatchMarker;
    if (!currentFetch.__hotelNoStorePatched) {
      const original = currentFetch.bind(window);
      const patched: FetchFn = (input, init) => {
        let url = "";
        if (typeof input === "string") url = input;
        else if (input instanceof URL) url = input.href;
        else if (input instanceof Request) url = input.url;

        const isApi =
          url.startsWith("/api/") ||
          url.includes(`${window.location.origin}/api/`);

        if (!isApi) return original(input, init);

        const nextInit: RequestInit = { ...(init ?? {}) };
        if (!nextInit.cache) nextInit.cache = "no-store";
        return original(input, nextInit);
      };
      (patched as FetchFn & PatchMarker).__hotelNoStorePatched = true;
      window.fetch = patched;
    }

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    void checkBuildId();
    pollTimer = setInterval(() => void checkBuildId(), BUILD_ID_POLL_MS);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return null;
}
