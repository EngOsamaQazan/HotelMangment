"use client";

import { useEffect, useState } from "react";

/**
 * Tiny SSR-safe `matchMedia` hook. The initial render uses `initial` (default
 * `false`) so server-rendered markup is stable; the effect upgrades the value
 * on the client once `window` is available. Listens for live changes so the
 * UI reacts to window resize, device rotation, and foldable posture changes.
 *
 *   const isMobile = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string, initial = false): boolean {
  const [matches, setMatches] = useState<boolean>(initial);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Safari < 14 lacks addEventListener on MediaQueryList.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

/** Convenience: true when viewport width < Tailwind `md` (768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/** Convenience: true when viewport width < Tailwind `lg` (1024px). */
export function useIsBelowLg(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
