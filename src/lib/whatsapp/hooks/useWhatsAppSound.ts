"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Tiny Web-Audio notification chime. Crafted to be subtle and pleasant,
 * not jarring like a browser default. Two-tone (E5 → A5) with a 60 ms gap,
 * 120 ms each, exponential decay — evokes the WhatsApp notification tone
 * without copying it.
 *
 * Web browsers won't let us play audio until the user has interacted with
 * the page. We lazily build the `AudioContext` on first play() call (which
 * always happens from within a user gesture or a `click` handler) and
 * reuse it thereafter.
 */
export function useWhatsAppSound(enabled: boolean = true) {
  const ctxRef = useRef<AudioContext | null>(null);
  const primedRef = useRef(false);

  useEffect(() => {
    return () => {
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  /** Call this once from a user gesture (click) to unlock audio playback. */
  const prime = useCallback(() => {
    if (typeof window === "undefined") return;
    if (primedRef.current) return;
    try {
      const Ctx = (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext) as typeof AudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      primedRef.current = true;
      // A silent 1ms buffer to actually unlock iOS.
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }, []);

  const play = useCallback(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    try {
      if (!ctxRef.current) prime();
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});

      const now = ctx.currentTime;
      const tone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + start);
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.18, now + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + start);
        osc.stop(now + start + duration + 0.02);
      };
      tone(659.25, 0, 0.12); // E5
      tone(880.0, 0.18, 0.18); // A5
    } catch {
      /* ignore */
    }
  }, [enabled, prime]);

  return { prime, play };
}
