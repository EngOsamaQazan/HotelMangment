"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface FloatingPosition {
  top: number;
  left: number;
  width?: number;
}

interface Props {
  open: boolean;
  position: FloatingPosition | null;
  anchorRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className: string;
  role?: "menu" | "dialog" | "listbox";
  ariaLabel?: string;
}

/**
 * Renders floating WhatsApp controls outside clipped cards and scroll panes.
 * The caller owns positioning so opening a menu never depends on an effect.
 */
export function FloatingLayer({
  open,
  position,
  anchorRef,
  onClose,
  children,
  className,
  role = "menu",
  ariaLabel,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        layerRef.current?.contains(target) ||
        anchorRef?.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onViewportMove = () => onClose();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportMove);
    window.addEventListener("scroll", onViewportMove, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportMove);
      window.removeEventListener("scroll", onViewportMove, true);
    };
  }, [anchorRef, onClose, open]);

  if (!open || !position) return null;

  return createPortal(
    <div
      ref={layerRef}
      role={role}
      aria-label={ariaLabel}
      className={className}
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function placeFloating({
  anchor,
  width,
  estimatedHeight,
  align = "end",
  gap = 8,
}: {
  anchor: DOMRect;
  width: number;
  estimatedHeight: number;
  align?: "start" | "end";
  gap?: number;
}): FloatingPosition {
  const margin = 8;
  const below = anchor.bottom + gap;
  const above = anchor.top - estimatedHeight - gap;
  const top =
    below + estimatedHeight > window.innerHeight
      ? Math.max(margin, above)
      : below;
  const preferredLeft = align === "end" ? anchor.right - width : anchor.left;
  const left = Math.min(
    window.innerWidth - width - margin,
    Math.max(margin, preferredLeft),
  );

  return { top, left, width };
}
