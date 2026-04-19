"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp,
  Loader2,
  AlertCircle,
  Printer,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";

interface Item {
  id: number;
  code: string;
  name: string;
  amount: number;
}

interface Data {
  revenues: Item[];
  expenses: Item[];
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
}

export default function IncomeStatementPage() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(lastDay);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/accounting/reports/income-statement?${params}`);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-3">
          <TrendingUp size={28} className="text-primary" />
          <h1 className="text-xl sm:text-2xl font-bold text-primary">
            قائمة الدخل
          </h1>
        </div>
        {data && (
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
          >
            <Printer size={16} /> طباعة
          </button>
        )}
      </div>

      <div className="bg-card-bg rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3 no-print">
        <div>
          <label className="block text-xs text-gray-500 mb-1">من</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">إلى</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
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
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                <ArrowUp size={16} /> الإيرادات
              </div>
              <p className="text-2xl font-bold text-green-800 mt-1">
                {formatAmount(data.totalRevenue)}
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                <ArrowDown size={16} /> المصروفات
              </div>
              <p className="text-2xl font-bold text-red-800 mt-1">
                {formatAmount(data.totalExpense)}
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl p-4 border",
                data.netProfit >= 0
                  ? "bg-primary/5 border-primary/20"
                  : "bg-orange-50 border-orange-200"
              )}
            >
              <div className="text-sm font-medium text-gray-600">
                {data.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة"}
              </div>
              <p
                className={cn(
                  "text-2xl font-bold mt-1",
                  data.netProfit >= 0 ? "text-primary" : "text-orange-800"
                )}
              >
                {formatAmount(Math.abs(data.netProfit))}
              </p>
            </div>
          </div>

          <div className="bg-card-bg rounded-xl shadow-sm p-6 space-y-6">
            <section>
              <h3 className="text-lg font-bold text-green-700 mb-3 flex items-center gap-2">
                <ArrowUp size={18} /> الإيرادات
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {data.revenues.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-gray-400" colSpan={3}>
                        لا توجد إيرادات
                      </td>
                    </tr>
                  ) : (
                    data.revenues.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">
                          {r.code}
                        </td>
                        <td className="px-4 py-2 text-gray-800">{r.name}</td>
                        <td className="px-4 py-2 text-left font-medium text-green-700">
                          {formatAmount(r.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-green-50 font-bold">
                    <td className="px-4 py-2" colSpan={2}>
                      إجمالي الإيرادات
                    </td>
                    <td className="px-4 py-2 text-left text-green-800">
                      {formatAmount(data.totalRevenue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section>
              <h3 className="text-lg font-bold text-red-700 mb-3 flex items-center gap-2">
                <ArrowDown size={18} /> المصروفات
              </h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {data.expenses.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-gray-400" colSpan={3}>
                        لا توجد مصروفات
                      </td>
                    </tr>
                  ) : (
                    data.expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">
                          {e.code}
                        </td>
                        <td className="px-4 py-2 text-gray-800">{e.name}</td>
                        <td className="px-4 py-2 text-left font-medium text-red-700">
                          {formatAmount(e.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-red-50 font-bold">
                    <td className="px-4 py-2" colSpan={2}>
                      إجمالي المصروفات
                    </td>
                    <td className="px-4 py-2 text-left text-red-800">
                      {formatAmount(data.totalExpense)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="pt-4 border-t">
              <div
                className={cn(
                  "flex items-center justify-between px-4 py-4 rounded-xl font-bold text-lg",
                  data.netProfit >= 0 ? "bg-primary/5" : "bg-orange-50"
                )}
              >
                <span>
                  {data.netProfit >= 0 ? "صافي الربح" : "صافي الخسارة"}
                </span>
                <span
                  className={cn(
                    data.netProfit >= 0 ? "text-primary" : "text-orange-700"
                  )}
                >
                  {formatAmount(Math.abs(data.netProfit))}
                </span>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
