"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarRange,
  Loader2,
  AlertCircle,
  Lock,
  Unlock,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Period {
  id: number;
  year: number;
  month: number;
  status: string;
  closedAt: string | null;
}

const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/periods");
      if (!res.ok) throw new Error("فشل التحميل");
      const json = await res.json();
      setPeriods(json.periods);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  async function act(year: number, month: number, action: string) {
    const msgs: Record<string, string> = {
      open: `فتح فترة ${month}/${year}؟`,
      close: `إقفال فترة ${month}/${year}؟ لن يمكن الترحيل عليها بعد ذلك.`,
    };
    if (!confirm(msgs[action])) return;

    setBusy(true);
    try {
      const res = await fetch("/api/accounting/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, action }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "فشل");
      }
      fetchPeriods();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  async function closeYear(year: number) {
    if (
      !confirm(
        `إقفال سنة ${year}؟ سيُنشأ قيد إقفال سنوي يرحّل صافي الربح/الخسارة إلى الأرباح المرحّلة، وتُقفل جميع فترات السنة. لا يمكن التراجع بسهولة.`
      )
    )
      return;

    setBusy(true);
    try {
      const res = await fetch("/api/accounting/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month: 12, action: "closeYear" }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error || "فشل");
      }
      const result = await res.json();
      if (result.entryNumber) {
        alert(
          `تم الإقفال. قيد الإقفال: ${result.entryNumber}\nصافي الربح/الخسارة: ${result.netProfit}`
        );
      } else {
        alert(result.message || "تم");
      }
      fetchPeriods();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setBusy(false);
    }
  }

  const byYear = periods.reduce<Record<number, Period[]>>((acc, p) => {
    if (!acc[p.year]) acc[p.year] = [];
    acc[p.year].push(p);
    return acc;
  }, {});
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarRange size={28} className="text-primary" />
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
          الفترات المالية
        </h1>
      </div>

      {error ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <AlertCircle size={36} className="text-danger" />
          <p className="text-danger">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          {years.map((year) => (
            <div key={year} className="bg-card-bg rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">عام {year}</h2>
                <button
                  onClick={() => closeYear(year)}
                  disabled={busy}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  <Archive size={16} /> إقفال السنة
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {byYear[year]
                  .sort((a, b) => a.month - b.month)
                  .map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "rounded-lg border p-3 text-center",
                        p.status === "open"
                          ? "bg-green-50 border-green-200"
                          : "bg-gray-100 border-gray-300"
                      )}
                    >
                      <div className="text-xs text-gray-500 mb-1">
                        {MONTH_NAMES[p.month - 1]}
                      </div>
                      <div
                        className={cn(
                          "text-sm font-bold mb-2",
                          p.status === "open"
                            ? "text-green-700"
                            : "text-gray-600"
                        )}
                      >
                        {p.status === "open" ? "مفتوحة" : "مقفلة"}
                      </div>
                      {p.status === "open" ? (
                        <button
                          onClick={() => act(p.year, p.month, "close")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline"
                        >
                          <Lock size={12} /> إقفال
                        </button>
                      ) : (
                        <button
                          onClick={() => act(p.year, p.month, "open")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Unlock size={12} /> إعادة فتح
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
