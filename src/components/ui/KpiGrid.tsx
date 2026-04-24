import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * KpiGrid — auto-fit KPI layout that never overflows.
 *
 * Why auto-fit instead of fixed breakpoints?
 *  - A simple `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` ladder means on
 *    Galaxy Fold (280px) two cards are crammed at < 120px each — below the
 *    tap-target minimum for number pills.
 *  - `repeat(auto-fit, minmax(min(10rem, 100%), 1fr))` adapts to *content*
 *    width, so on a 280px viewport you get 1 column (full width), on 375px
 *    you get 2 columns, and so on up to 6 columns on desktop — without the
 *    author having to think about breakpoints.
 *
 * Author-level cards are expected to have their own styling; this primitive
 * is a pure layout container.
 */
export function KpiGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("kpi-grid", className)}>{children}</div>;
}

/**
 * Optional standardized KpiCard — feel free to skip it and style your own.
 * Provided so simple dashboards can wire it up with minimal code.
 */
export function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "primary" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-white border-gray-200",
    primary: "bg-primary/5 border-primary/20",
    success: "bg-green-50 border-green-200",
    warning: "bg-amber-50 border-amber-200",
    danger: "bg-red-50 border-red-200",
    info: "bg-blue-50 border-blue-200",
  };
  const iconTone: Record<string, string> = {
    neutral: "bg-gray-100 text-gray-600",
    primary: "bg-primary/10 text-primary",
    success: "bg-green-100 text-green-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex items-center justify-between gap-2 min-w-0",
        toneClasses[tone],
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-gray-500 font-semibold truncate">
          {label}
        </p>
        <p className="text-base sm:text-lg font-bold text-gray-900 truncate">
          {value}
        </p>
      </div>
      {icon && (
        <span
          className={cn(
            "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
            iconTone[tone],
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
    </div>
  );
}
