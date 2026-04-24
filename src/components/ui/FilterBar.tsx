import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * FilterBar — flex-wrap row for search/filter controls.
 *
 * Why it exists:
 *  - Every list page hand-rolls `flex flex-wrap gap-2` and some forget to
 *    add `min-w-0` on select children. On narrow screens this causes the
 *    whole row to expand past the viewport (one of the bugs we hit on
 *    Galaxy Fold).
 *  - The CSS class `.filter-bar` (globals.css) enforces `min-width: 0` on
 *    every direct child *and* makes text/search inputs `flex: 1 1 12rem`
 *    so they grow to fill the row but shrink cleanly below their ideal
 *    width.
 *
 * Usage:
 *   <FilterBar>
 *     <input type="search" ... />
 *     <select ... />
 *     <select ... />
 *   </FilterBar>
 */
export function FilterBar({
  children,
  className,
  bordered = true,
}: {
  children: ReactNode;
  className?: string;
  /** If true (default) wraps in a white card. Set false for pages that
   *  already supply their own container. */
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        "filter-bar",
        bordered &&
          "bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
