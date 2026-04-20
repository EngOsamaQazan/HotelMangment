"use client";

import { ChevronRight, ChevronLeft } from "lucide-react";
import { useMemo } from "react";

/**
 * Reusable pagination — Al-Mafraq brand look (emerald/gold).
 *
 * Simple, accessible, no external deps. Renders compact page controls with
 * a small "showing N of M" counter and an RTL-aware next/prev pair.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  className = "",
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pages = useMemo(() => {
    return buildPageRange(page, totalPages);
  }, [page, totalPages]);

  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <nav
      dir="rtl"
      aria-label="ترقيم الصفحات"
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 ${className}`}
    >
      <p className="text-xs sm:text-sm text-gray-500">
        عرض <span className="font-semibold text-primary">{from}</span>
        {" – "}
        <span className="font-semibold text-primary">{to}</span>
        {" من "}
        <span className="font-semibold text-primary">{total}</span>
        {" سجل"}
      </p>

      {totalPages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <button
              type="button"
              onClick={() => onChange(page - 1)}
              disabled={isFirst}
              aria-label="السابق"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gold/25 text-primary bg-card-bg hover:bg-gold-soft hover:border-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </li>
          {pages.map((p, i) =>
            p === "…" ? (
              <li
                key={`g-${i}`}
                aria-hidden
                className="px-1 text-gold-dark select-none"
              >
                …
              </li>
            ) : (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onChange(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={
                    "h-9 min-w-9 px-3 inline-flex items-center justify-center rounded-lg text-sm font-semibold border transition-colors " +
                    (p === page
                      ? "bg-primary text-gold border-gold/50 shadow"
                      : "bg-card-bg text-primary border-gold/25 hover:bg-gold-soft hover:border-gold/50")
                  }
                >
                  {p.toLocaleString("ar-EG")}
                </button>
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              onClick={() => onChange(page + 1)}
              disabled={isLast}
              aria-label="التالي"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gold/25 text-primary bg-card-bg hover:bg-gold-soft hover:border-gold/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}

/**
 * Returns up to 7 slots: first, (…|2), current-1, current, current+1, (…|n-1), last.
 * Ellipses replaced with "…" literal so callers can render them as text.
 */
function buildPageRange(
  current: number,
  total: number,
): Array<number | "…"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const range: Array<number | "…"> = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  range.push(1);
  if (left > 2) range.push("…");
  for (let i = left; i <= right; i++) range.push(i);
  if (right < total - 1) range.push("…");
  range.push(total);
  return range;
}

/**
 * Client-side pagination hook: slices a full dataset locally.
 * Good for lists that already load all records in memory.
 */
export function usePaginatedSlice<T>(
  items: T[],
  page: number,
  pageSize: number,
): T[] {
  return useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);
}
