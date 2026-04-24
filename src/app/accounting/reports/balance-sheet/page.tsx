"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wallet,
  Loader2,
  AlertCircle,
  Printer,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { cn, formatAmount, formatDate } from "@/lib/utils";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface Item {
  id: number;
  code: string;
  name: string;
  type: string;
  balance: number;
}

interface Data {
  asOf: string | null;
  assets: Item[];
  liabilities: Item[];
  equity: Item[];
  totalAssets: number;
  totalLiabilities: number;
  bookedEquity: number;
  currentYearProfit: number;
  totalEquity: number;
  totalLiabilitiesEquity: number;
  balanced: boolean;
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (asOf) params.set("asOf", asOf);
      const res = await fetch(`/api/accounting/reports/balance-sheet?${params}`);
      if (!res.ok) throw new Error("فشل التحميل");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <PageShell>
      <div className="no-print">
        <PageHeader
          title="الميزانية العمومية"
          icon={<Wallet size={24} />}
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
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-500 shrink-0">حتى تاريخ:</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm min-w-0"
          />
          {asOf && (
            <button
              onClick={() => setAsOf("")}
              className="text-xs text-danger hover:underline"
            >
              مسح
            </button>
          )}
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
          <div
            className={cn(
              "rounded-xl p-4 border flex items-center gap-3",
              data.balanced
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            )}
          >
            {data.balanced ? (
              <CheckCircle size={24} className="text-green-700" />
            ) : (
              <XCircle size={24} className="text-red-700" />
            )}
            <div>
              <p
                className={cn(
                  "font-bold",
                  data.balanced ? "text-green-700" : "text-red-700"
                )}
              >
                {data.balanced
                  ? "الأصول = الخصوم + حقوق الملكية ✓"
                  : "الميزانية غير متوازنة"}
              </p>
              <p className="text-xs text-gray-600">
                {formatAmount(data.totalAssets)} ={" "}
                {formatAmount(data.totalLiabilitiesEquity)}
                {asOf ? ` — حتى ${formatDate(asOf)}` : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <section className="bg-card-bg rounded-xl shadow-sm p-3 sm:p-6 overflow-x-auto">
              <h3 className="text-lg font-bold text-blue-700 mb-3">الأصول</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {data.assets.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-gray-400" colSpan={3}>
                        لا توجد أصول
                      </td>
                    </tr>
                  ) : (
                    data.assets.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">
                          {a.code}
                        </td>
                        <td className="px-4 py-2 text-gray-800">{a.name}</td>
                        <td className="px-4 py-2 text-left font-medium">
                          {formatAmount(a.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-bold text-blue-800">
                    <td className="px-4 py-2" colSpan={2}>
                      إجمالي الأصول
                    </td>
                    <td className="px-4 py-2 text-left">
                      {formatAmount(data.totalAssets)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="bg-card-bg rounded-xl shadow-sm p-3 sm:p-6 space-y-6 overflow-x-auto">
              <div>
                <h3 className="text-lg font-bold text-orange-700 mb-3">الخصوم</h3>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {data.liabilities.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-gray-400" colSpan={3}>
                          لا توجد خصوم
                        </td>
                      </tr>
                    ) : (
                      data.liabilities.map((l) => (
                        <tr key={l.id}>
                          <td className="px-4 py-2 font-mono text-xs text-gray-500">
                            {l.code}
                          </td>
                          <td className="px-4 py-2 text-gray-800">{l.name}</td>
                          <td className="px-4 py-2 text-left font-medium">
                            {formatAmount(l.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-orange-50 font-bold text-orange-800">
                      <td className="px-4 py-2" colSpan={2}>
                        إجمالي الخصوم
                      </td>
                      <td className="px-4 py-2 text-left">
                        {formatAmount(data.totalLiabilities)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div>
                <h3 className="text-lg font-bold text-purple-700 mb-3">
                  حقوق الملكية
                </h3>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {data.equity.map((e) => (
                      <tr key={e.id}>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">
                          {e.code}
                        </td>
                        <td className="px-4 py-2 text-gray-800">{e.name}</td>
                        <td className="px-4 py-2 text-left font-medium">
                          {formatAmount(e.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td className="px-4 py-2 text-xs text-gray-400">—</td>
                      <td className="px-4 py-2 text-gray-800">
                        {data.currentYearProfit >= 0 ? "ربح" : "خسارة"} السنة الحالية
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-left font-medium",
                          data.currentYearProfit >= 0
                            ? "text-green-700"
                            : "text-red-700"
                        )}
                      >
                        {formatAmount(data.currentYearProfit)}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr className="bg-purple-50 font-bold text-purple-800">
                      <td className="px-4 py-2" colSpan={2}>
                        إجمالي حقوق الملكية
                      </td>
                      <td className="px-4 py-2 text-left">
                        {formatAmount(data.totalEquity)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-100 font-bold">
                  <span>إجمالي الخصوم + حقوق الملكية</span>
                  <span>{formatAmount(data.totalLiabilitiesEquity)}</span>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </PageShell>
  );
}
