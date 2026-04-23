"use client";

import { cn } from "@/lib/utils";
import type { ScopeFilter, StatusFilter } from "../_types";

interface Props {
  scope: ScopeFilter;
  setScope: (s: ScopeFilter) => void;
  status: StatusFilter;
  setStatus: (s: StatusFilter) => void;
  counts: { all: number; mine: number; unassigned: number };
}

/** Segmented tabs: Mine / Unassigned / All + status pills. */
export function FilterTabs({ scope, setScope, status, setStatus, counts }: Props) {
  const tabs: { key: ScopeFilter; label: string; count: number }[] = [
    { key: "mine", label: "المسندة لي", count: counts.mine },
    { key: "unassigned", label: "غير مسندة", count: counts.unassigned },
    { key: "all", label: "الكل", count: counts.all },
  ];

  const statuses: { key: StatusFilter; label: string }[] = [
    { key: "open", label: "مفتوحة" },
    { key: "resolved", label: "محلولة" },
    { key: "archived", label: "مؤرشفة" },
    { key: "any", label: "الجميع" },
  ];

  return (
    <div className="px-3 pt-3 pb-2 border-b border-gray-100 space-y-2">
      <div
        role="tablist"
        aria-label="نطاق المحادثات"
        className="flex items-center gap-1 bg-gray-100 rounded-lg p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={scope === t.key}
            onClick={() => setScope(t.key)}
            className={cn(
              "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
              scope === t.key
                ? "bg-white text-primary shadow-sm"
                : "text-gray-600 hover:text-gray-800",
            )}
          >
            {t.label}
            <span className="mx-1 text-[10px] text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {statuses.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatus(s.key)}
            className={cn(
              "text-[11px] px-2 py-1 rounded-full border transition-colors",
              status === s.key
                ? "bg-primary text-white border-primary"
                : "border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
