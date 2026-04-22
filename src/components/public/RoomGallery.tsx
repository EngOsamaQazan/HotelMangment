"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/** Single image in the gallery. `caption` is shown in the lightbox.
 *  `aspect` controls the grid cell height so the masonry looks deliberate. */
export interface RoomImage {
  src: string;
  caption: string;
  /** Tailwind aspect-class. Defaults to aspect-[4/3]. */
  aspect?: string;
  /** Tailwind col-span on md+ — use 2 to make a "hero" tile. */
  span?: 1 | 2;
}

/** Masonry-ish gallery with a keyboard-navigable lightbox.
 *  - Server-rendered landing page embeds this; it hydrates only if the user
 *    scrolls to the gallery section (React-default hydration).
 *  - Uses next/image so Next optimizes each room photo (WebP, lazy-loading). */
export function RoomGallery({ images }: { images: RoomImage[] }) {
  const [active, setActive] = useState<number | null>(null);

  const close = useCallback(() => setActive(null), []);
  const next = useCallback(
    () => setActive((i) => (i === null ? null : (i + 1) % images.length)),
    [images.length],
  );
  const prev = useCallback(
    () =>
      setActive((i) =>
        i === null ? null : (i - 1 + images.length) % images.length,
      ),
    [images.length],
  );

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") next(); // RTL: left arrow = next
      else if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [active, close, next, prev]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {images.map((img, i) => (
          <button
            key={img.src}
            type="button"
            onClick={() => setActive(i)}
            className={`group relative overflow-hidden rounded-xl bg-gold-soft/50 ring-1 ring-gold/20 hover:ring-gold/60 transition-all ${
              img.span === 2 ? "md:col-span-2 md:row-span-2" : ""
            } ${img.aspect ?? "aspect-[4/3]"}`}
            aria-label={`عرض صورة: ${img.caption}`}
          >
            <Image
              src={img.src}
              alt={img.caption}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              loading={i < 4 ? "eager" : "lazy"}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-0 right-0 left-0 p-2 md:p-3 text-white text-xs md:text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              {img.caption}
            </div>
          </button>
        ))}
      </div>

      {active !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition"
            aria-label="إغلاق"
          >
            <X size={24} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition"
            aria-label="السابق"
          >
            <ChevronRight size={28} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition"
            aria-label="التالي"
          >
            <ChevronLeft size={28} />
          </button>

          <div
            className="relative w-full max-w-5xl h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={images[active].src}
              alt={images[active].caption}
              fill
              sizes="90vw"
              className="object-contain"
              priority
            />
            <div className="absolute bottom-0 inset-x-0 text-center text-white/90 text-sm md:text-base bg-black/40 py-2 px-4">
              {images[active].caption}
              <span className="mx-2 text-white/50">·</span>
              <span className="text-white/60" dir="ltr">
                {active + 1} / {images.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
