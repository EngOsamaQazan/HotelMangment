import { cn } from "@/lib/utils";
import type { Key, ReactNode } from "react";

export interface ResponsiveTableColumn<T> {
  /** Unique key for the column (used as React key + for card labels). */
  key: string;
  /** Header label. Also used as the "label" in the mobile card fallback. */
  label: ReactNode;
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  /** Additional classes for both <th> and <td> cells. */
  className?: string;
  /** Text alignment. Defaults to "start". */
  align?: "start" | "center" | "end";
  /** If true, this column is omitted from the mobile card auto-layout.
   *  Useful for columns whose content is merged into the card title. */
  hiddenOnMobile?: boolean;
  /** If true, renders this column only on mobile (for custom action buttons). */
  mobileOnly?: boolean;
}

export interface ResponsiveTableProps<T> {
  columns: ResponsiveTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => Key;
  /** Optional custom mobile card renderer. If omitted, a generic card with
   *  label/value rows is rendered from the column definitions. */
  mobileCard?: (row: T) => ReactNode;
  /** Shown when rows is empty. */
  emptyState?: ReactNode;
  /** Click handler for the whole row (both desktop & mobile card). */
  onRowClick?: (row: T) => void;
  className?: string;
  /** Desktop container variant. Default `card` wraps in bg-white+rounded. */
  desktopVariant?: "card" | "plain";
}

/**
 * ResponsiveTable — single source of truth for list screens.
 *
 * Behavior:
 *  - ≥ md: classic `<table>` with horizontal overflow inside the card.
 *  - < md: each row becomes a `.rt-card` showing `label: value` stacked rows.
 *    The author can supply `mobileCard(row)` for bespoke layouts (e.g. a
 *    ReservationCard with status chip + amount pills).
 *
 * Why a data-driven API (instead of children) ?
 *  - Lets us render two completely different DOMs (table vs cards) from a
 *    single column spec without the author duplicating markup — which is
 *    what every existing list page currently does (md:hidden + md:block
 *    twin trees).
 */
export function ResponsiveTable<T>({
  columns,
  rows,
  getRowKey,
  mobileCard,
  emptyState,
  onRowClick,
  className,
  desktopVariant = "card",
}: ResponsiveTableProps<T>) {
  const isEmpty = rows.length === 0;

  if (isEmpty) {
    return (
      <div
        className={cn(
          desktopVariant === "card" &&
            "bg-white border border-gray-200 rounded-xl",
          "p-8 text-center text-sm text-gray-400",
          className,
        )}
      >
        {emptyState ?? "لا توجد نتائج"}
      </div>
    );
  }

  const alignClass: Record<string, string> = {
    start: "text-start",
    center: "text-center",
    end: "text-end",
  };

  const desktopCols = columns.filter((c) => !c.mobileOnly);
  const mobileCols = columns.filter((c) => !c.hiddenOnMobile);

  return (
    <div className={cn("rt-wrap", className)}>
      {/* Desktop (≥ md) */}
      <div
        className={cn(
          "rt-desktop",
          desktopVariant === "card" &&
            "bg-white border border-gray-200 rounded-xl overflow-hidden",
        )}
      >
        <table className="rt-table">
          <thead>
            <tr>
              {desktopCols.map((c) => (
                <th
                  key={c.key}
                  className={cn(alignClass[c.align ?? "start"], c.className)}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={getRowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {desktopCols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(alignClass[c.align ?? "start"], c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile (< md) */}
      <div className="rt-mobile">
        {rows.map((row, i) => {
          const key = getRowKey(row, i);
          if (mobileCard) {
            return (
              <div
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {mobileCard(row)}
              </div>
            );
          }
          return (
            <div
              key={key}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("rt-card", onRowClick && "cursor-pointer")}
            >
              {mobileCols.map((c) => (
                <div key={c.key} className="rt-card-row">
                  <span className="rt-card-label">{c.label}</span>
                  <span className="rt-card-value">{c.cell(row)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
