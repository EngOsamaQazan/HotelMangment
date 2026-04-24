import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * ActionBar — standardized placement for page-level action buttons.
 *
 * Variants:
 *  - `inline` (default): classic flex row. Buttons stretch on tiny screens
 *    (< 480px) so every tap target clears the WCAG 2.5.5 44px minimum, and
 *    relax to intrinsic width on wider viewports.
 *  - `sticky-mobile`: same behavior above `md`, but below `md` the bar is
 *    docked to the bottom of the viewport with safe-area padding — exactly
 *    the iOS/Android pattern for "primary action" on long forms/detail pages.
 *  - `sticky`: docked everywhere (use sparingly; reserve for long forms).
 *
 * Usage:
 *   <ActionBar variant="sticky-mobile">
 *     <button type="button" onClick={cancel}>إلغاء</button>
 *     <button type="submit" className="btn-primary">حفظ</button>
 *   </ActionBar>
 */
export function ActionBar({
  children,
  variant = "inline",
  className,
  as = "div",
}: {
  children: ReactNode;
  variant?: "inline" | "sticky" | "sticky-mobile";
  className?: string;
  as?: "div" | "footer";
}) {
  const Tag = as;
  const classes = cn(
    variant === "inline" && "action-bar",
    variant === "sticky" && "action-bar-sticky",
    variant === "sticky-mobile" && "action-bar-sticky action-bar-sticky-mobile",
    className,
  );
  return <Tag className={classes}>{children}</Tag>;
}
