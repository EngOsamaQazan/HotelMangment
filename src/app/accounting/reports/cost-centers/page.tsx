"use client";

import { useCallback, useEffect, useState } from "react";
import { Target, Loader2, AlertCircle, Printer } from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface Row {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  depth: number;
  debitOwn: number;
  creditOwn: number;
  linesOwn: number;
  debit: number;
  credit: number;
  net: number;
  lines: number;
  hasChildren: boolean;
}

interface Data {
  from: string | null;
  to: string | null;
  rows: Row[];
  totals: { debit: number; credit: number; net: number };
}

function startOfMonthIso(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().split("T")[0];
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export default function CostCentersReportPage() {
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(
        `/api/accounting/reports/cost-centers?${params}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("فشل التحميل");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const grandTotal = data?.totals;

  return (
    <PageShell>
      <div className="no-print">
        <PageHeader
          title="نتائج مراكز التكلفة"
          icon={<Target size={24} />}
          description="إجمالي الحركات لكل مركز تكلفة، مع تجميع الأبناء تحت الآباء"
          actions={
            data && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark tap-44"
              >
                <Printer size={16} /> <span>طباعة</span>
              </button>
            )
          }
        />
      </div>

      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm no-print">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">من</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">إلى</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => {
                setFrom(startOfMonthIso());
                setTo(todayIso());
              }}
              className="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50"
            >
              هذا الشهر
            </button>
            <button
              onClick={() => {
                const d = new Date();
                setFrom(`${d.getFullYear()}-01-01`);
                setTo(todayIso());
              }}
              className="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50"
            >
              منذ بداية السنة
            </button>
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50"
            >
              كل الفترات
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center py-10 gap-3">
          <AlertCircle size={36} className="text-danger" />
          <p className="text-danger">{error}</p>
        </div>
      ) : loading || !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : data.rows.length === 0 ? (
        <div className="bg-card-bg rounded-xl p-10 text-center text-gray-500">
          <Target size={48} className="mx-auto text-gray-300 mb-3" />
          <p>لا توجد مراكز تكلفة بعد</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-xs text-blue-700/80">إجمالي المدين</div>
              <div className="text-2xl font-bold text-blue-800 tabular-nums mt-1">
                {formatAmount(grandTotal?.debit ?? 0)}
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-xs text-emerald-700/80">إجمالي الدائن</div>
              <div className="text-2xl font-bold text-emerald-800 tabular-nums mt-1">
                {formatAmount(grandTotal?.credit ?? 0)}
              </div>
            </div>
            <div
              className={cn(
                "border rounded-xl p-4",
                (grandTotal?.net ?? 0) >= 0
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200",
              )}
            >
              <div
                className={cn(
                  "text-xs",
                  (grandTotal?.net ?? 0) >= 0
                    ? "text-green-700/80"
                    : "text-red-700/80",
                )}
              >
                صافي (مدين − دائن)
              </div>
              <div
                className={cn(
                  "text-2xl font-bold tabular-nums mt-1",
                  (grandTotal?.net ?? 0) >= 0
                    ? "text-green-800"
                    : "text-red-800",
                )}
              >
                {formatAmount(grandTotal?.net ?? 0)}
              </div>
            </div>
          </div>

          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th className="sticky-start text-right">الرمز</th>
                    <th className="text-right">المركز</th>
                    <th className="text-right">قيود</th>
                    <th className="text-right">مدين (هذا فقط)</th>
                    <th className="text-right">دائن (هذا فقط)</th>
                    <th className="text-right">مدين (مع الأبناء)</th>
                    <th className="text-right">دائن (مع الأبناء)</th>
                    <th className="text-right">صافي</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        "hover:bg-gray-50/50",
                        r.hasChildren && "bg-gray-50/40 font-semibold",
                      )}
                    >
                      <td className="sticky-start font-mono text-primary">
                        {r.code}
                      </td>
                      <td className="text-gray-800">
                        <span style={{ paddingInlineStart: r.depth * 16 }}>
                          {r.depth > 0 && (
                            <span className="text-gray-300 mx-1">└</span>
                          )}
                          {r.name}
                        </span>
                      </td>
                      <td className="text-gray-500 text-xs tabular-nums">
                        {r.lines}
                        {r.hasChildren && r.linesOwn !== r.lines && (
                          <span className="text-gray-400">
                            {" "}
                            ({r.linesOwn})
                          </span>
                        )}
                      </td>
                      <td className="text-blue-700/80 tabular-nums">
                        {r.debitOwn > 0 ? formatAmount(r.debitOwn) : ""}
                      </td>
                      <td className="text-emerald-700/80 tabular-nums">
                        {r.creditOwn > 0 ? formatAmount(r.creditOwn) : ""}
                      </td>
                      <td className="text-blue-800 font-medium tabular-nums">
                        {r.debit > 0 ? formatAmount(r.debit) : ""}
                      </td>
                      <td className="text-emerald-800 font-medium tabular-nums">
                        {r.credit > 0 ? formatAmount(r.credit) : ""}
                      </td>
                      <td
                        className={cn(
                          "font-bold tabular-nums",
                          r.net > 0
                            ? "text-blue-800"
                            : r.net < 0
                              ? "text-emerald-800"
                              : "text-gray-400",
                        )}
                      >
                        {r.net !== 0 ? formatAmount(r.net) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td className="sticky-start" colSpan={5}>
                      الإجمالي (المراكز الجذرية فقط)
                    </td>
                    <td className="text-blue-800 tabular-nums">
                      {formatAmount(data.totals.debit)}
                    </td>
                    <td className="text-emerald-800 tabular-nums">
                      {formatAmount(data.totals.credit)}
                    </td>
                    <td
                      className={cn(
                        "tabular-nums",
                        data.totals.net >= 0
                          ? "text-blue-800"
                          : "text-emerald-800",
                      )}
                    >
                      {formatAmount(data.totals.net)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-500 no-print">
            ملاحظة: عمود "هذا فقط" يُظهر حركات السطر الواحد للمركز نفسه، أما
            "مع الأبناء" فهو الإجمالي بعد ضمّ الفروع التابعة. الإجمالي العام
            يُحسب من المراكز الجذرية فقط لتجنّب الازدواج.
          </p>
        </>
      )}
    </PageShell>
  );
}
