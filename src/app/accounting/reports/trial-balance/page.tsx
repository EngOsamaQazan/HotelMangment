"use client";

import { useCallback, useEffect, useState } from "react";
import { Scale, Loader2, AlertCircle, Printer, CheckCircle, XCircle } from "lucide-react";
import { cn, formatAmount, formatDate } from "@/lib/utils";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface Row {
  id: number;
  code: string;
  name: string;
  type: string;
  normalBalance: string;
  debit: number;
  credit: number;
  debitBalance: number;
  creditBalance: number;
}

interface Data {
  asOf: string | null;
  rows: Row[];
  totals: {
    debit: number;
    credit: number;
    debitBalance: number;
    creditBalance: number;
  };
}

const TYPE_LABELS: Record<string, string> = {
  asset: "أصول",
  liability: "خصوم",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  expense: "مصروفات",
};

export default function TrialBalancePage() {
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
      const res = await fetch(`/api/accounting/reports/trial-balance?${params}`);
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

  const balanced = data && Math.abs(data.totals.debitBalance - data.totals.creditBalance) < 0.01;

  return (
    <PageShell>
      <div className="no-print">
        <PageHeader
          title="ميزان المراجعة"
          icon={<Scale size={24} />}
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
              balanced
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            )}
          >
            {balanced ? (
              <CheckCircle size={24} className="text-green-700" />
            ) : (
              <XCircle size={24} className="text-red-700" />
            )}
            <div>
              <p className={cn("font-bold", balanced ? "text-green-700" : "text-red-700")}>
                {balanced ? "الميزان متوازن" : "الميزان غير متوازن"}
              </p>
              {asOf && (
                <p className="text-xs text-gray-600">حتى {formatDate(asOf)}</p>
              )}
            </div>
          </div>

          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th className="sticky-start text-right">الرمز</th>
                    <th className="text-right">الحساب</th>
                    <th className="text-right">النوع</th>
                    <th className="text-right">مدين</th>
                    <th className="text-right">دائن</th>
                    <th className="text-right">رصيد مدين</th>
                    <th className="text-right">رصيد دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="sticky-start font-mono text-primary">{r.code}</td>
                      <td className="font-medium text-gray-800">{r.name}</td>
                      <td className="text-gray-500 text-xs">
                        {TYPE_LABELS[r.type]}
                      </td>
                      <td className="text-green-700">
                        {r.debit > 0 ? formatAmount(r.debit) : ""}
                      </td>
                      <td className="text-red-700">
                        {r.credit > 0 ? formatAmount(r.credit) : ""}
                      </td>
                      <td className="font-bold text-green-700">
                        {r.debitBalance > 0 ? formatAmount(r.debitBalance) : ""}
                      </td>
                      <td className="font-bold text-red-700">
                        {r.creditBalance > 0 ? formatAmount(r.creditBalance) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td className="sticky-start" colSpan={3}>
                      الإجمالي
                    </td>
                    <td className="text-green-700">
                      {formatAmount(data.totals.debit)}
                    </td>
                    <td className="text-red-700">
                      {formatAmount(data.totals.credit)}
                    </td>
                    <td className="text-green-700">
                      {formatAmount(data.totals.debitBalance)}
                    </td>
                    <td className="text-red-700">
                      {formatAmount(data.totals.creditBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
