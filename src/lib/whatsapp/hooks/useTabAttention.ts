"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Grab the user's attention when new messages arrive while the tab is
 * backgrounded.
 *
 *  • Title flashes between the original title and a prefix.
 *  • The favicon swaps in a tiny green dot overlay.
 *  • Everything reverts the moment the tab becomes visible again.
 */
export function useTabAttention() {
  const originalTitleRef = useRef<string | null>(null);
  const originalFaviconRef = useRef<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotFaviconRef = useRef<string | null>(null);

  // Stop + restore when the tab becomes visible.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onVis = () => {
      if (document.visibilityState === "visible") clear();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const clear = useCallback(() => {
    if (flashTimerRef.current) {
      clearInterval(flashTimerRef.current);
      flashTimerRef.current = null;
    }
    if (originalTitleRef.current !== null) {
      document.title = originalTitleRef.current;
      originalTitleRef.current = null;
    }
    if (originalFaviconRef.current !== null) {
      setFaviconHref(originalFaviconRef.current);
      originalFaviconRef.current = null;
    }
  }, []);

  const setFaviconHref = (href: string) => {
    const link =
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]') ??
      (() => {
        const l = document.createElement("link");
        l.rel = "icon";
        document.head.appendChild(l);
        return l;
      })();
    link.href = href;
  };

  const buildDotFavicon = (): string => {
    if (dotFaviconRef.current) return dotFaviconRef.current;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#25d366";
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 32, 34);
    const data = c.toDataURL("image/png");
    dotFaviconRef.current = data;
    return data;
  };

  /** Start flashing. Ignored if the tab is already visible. */
  const flash = useCallback(
    (prefix: string = "● رسالة جديدة") => {
      if (typeof window === "undefined") return;
      if (document.visibilityState === "visible") return;
      if (flashTimerRef.current) return;

      originalTitleRef.current = document.title;
      const favLink = document.querySelector<HTMLLinkElement>(
        'link[rel~="icon"]',
      );
      originalFaviconRef.current = favLink?.href ?? "/favicon.ico";
      setFaviconHref(buildDotFavicon());

      let toggled = false;
      flashTimerRef.current = setInterval(() => {
        toggled = !toggled;
        document.title = toggled
          ? `${prefix} — ${originalTitleRef.current ?? ""}`
          : (originalTitleRef.current ?? "");
      }, 1000);
    },
    [],
  );

  useEffect(() => () => clear(), [clear]);
  return { flash, clear };
}
