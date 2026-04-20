"use client";

import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const sizeMap: Record<
  Size,
  { box: string; caption: string; gap: string; captionSize: string }
> = {
  sm: {
    box: "w-20 h-10",
    captionSize: "text-[8px]",
    caption: "tracking-[0.32em]",
    gap: "mt-0.5",
  },
  md: {
    box: "w-32 h-16",
    captionSize: "text-[10px]",
    caption: "tracking-[0.4em]",
    gap: "mt-1",
  },
  lg: {
    box: "w-48 h-24",
    captionSize: "text-sm",
    caption: "tracking-[0.5em]",
    gap: "mt-1.5",
  },
  xl: {
    box: "w-64 h-32 sm:w-72 sm:h-36",
    captionSize: "text-base",
    caption: "tracking-[0.55em]",
    gap: "mt-2",
  },
};

/**
 * BrandLogo — فندق المفرق
 *
 * Uses the official calligraphic logo (gold Arabic "المفرق") from the brand pack.
 * On dark emerald surfaces the logo reads as gold on green.
 * On light surfaces we apply a subtle emerald tint to ensure contrast.
 */
export function BrandLogo({
  size = "md",
  variant = "onDark",
  showCaption = true,
  className,
}: {
  size?: Size;
  variant?: "onDark" | "onLight";
  showCaption?: boolean;
  className?: string;
}) {
  const s = sizeMap[size];
  const captionColor =
    variant === "onDark" ? "text-white/90" : "text-primary";

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center leading-none select-none",
        className
      )}
      aria-label="فندق المفرق"
    >
      <div className={cn("relative", s.box)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="فندق المفرق"
          className="absolute inset-0 w-full h-full object-contain"
          style={
            variant === "onLight"
              ? { filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }
              : undefined
          }
        />
      </div>
      {showCaption && (
        <span
          className={cn(
            "uppercase font-semibold",
            s.captionSize,
            s.caption,
            captionColor,
            s.gap
          )}
        >
          Hotel
        </span>
      )}
    </div>
  );
}

/**
 * Compact horizontal lockup for tight bars (mobile top-bar, print headers).
 */
export function BrandLogoInline({
  variant = "onDark",
  className,
}: {
  variant?: "onDark" | "onLight";
  className?: string;
}) {
  const captionColor =
    variant === "onDark" ? "text-white/70" : "text-primary/60";

  return (
    <div
      className={cn("inline-flex items-center gap-2", className)}
      aria-label="فندق المفرق"
    >
      <div className="relative w-16 h-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="فندق المفرق"
          className="absolute inset-0 w-full h-full object-contain"
        />
      </div>
      <span
        className={cn(
          "text-[10px] tracking-[0.3em] uppercase font-semibold",
          captionColor
        )}
      >
        Hotel
      </span>
    </div>
  );
}
