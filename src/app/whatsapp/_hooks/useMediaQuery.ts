"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny SSR-safe `matchMedia` hook. The initial render uses `initial` (default
 * `false`) so server-rendered markup is stable; the effect upgrades the value
 * on the client once `window` is available. Listens for live changes so the
 * UI reacts to window resize, device rotation, and foldable posture changes.
 *
 *   const isMobile = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string, initial = false): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined" || !window.matchMedia) {
        return () => {};
      }
      const mql = window.matchMedia(query);
      // Safari < 14 lacks addEventListener on MediaQueryList.
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onStoreChange);
        return () => mql.removeEventListener("change", onStoreChange);
      }
      mql.addListener(onStoreChange);
      return () => mql.removeListener(onStoreChange);
    },
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(query).matches
        : initial,
    () => initial,
  );
}

/** Convenience: true when viewport width < Tailwind `md` (768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/** Convenience: true when viewport width < Tailwind `lg` (1024px). */
export function useIsBelowLg(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
