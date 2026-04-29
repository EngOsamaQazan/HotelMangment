"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Receipt,
  Loader2,
  AlertCircle,
  User,
  ChevronLeft,
  HandCoins,
  X,
  Banknote,
  Wallet,
  CheckCircle,
} from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/client";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/ui/KpiGrid";
import { JournalAttachments } from "@/components/accounting/JournalAttachments";

interface EmployeeSummary {
  id: number;
  name: string;
  jobTitle: string | null;
  isActive: boolean;
  baseSalary: number | null;
  commissionRate: number | null;
  salaryPayDay: number | null;
  payroll?: {
    gross: number;
    commission: number;
    outstandingAdvance: number;
    net: number;
  };
}

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

type PaymentAccountCode = "1010" | "1020" | "1030";

function paymentAccountLabel(code: PaymentAccountCode): string {
  if (code === "1010") return "الصندوق النقدي";
  if (code === "1020") return "البنك";
  return "المحفظة الإلكترونية";
}

export default function PayrollListPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const { can } = usePermissions();
  const canAdvance = can("accounting.parties:advance");

  const [advanceTarget, setAdvanceTarget] =
    useState<{ id: number; name: string; outstanding: number } | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceAccount, setAdvanceAccount] =
    useState<PaymentAccountCode>("1010");
  const [advanceDate, setAdvanceDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [advanceNote, setAdvanceNote] = useState("");
  const [advanceFiles, setAdvanceFiles] = useState<File[]>([]);
  const [advanceSubmitting, setAdvanceSubmitting] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/accounting/parties?type=employee");
      if (!res.ok) throw new Error("فشل تحميل الموظفين");
      const json = await res.json();
      const emps: EmployeeSummary[] = json.parties;

      const withPayroll = await Promise.all(
        emps.map(async (e) => {
          try {
            const pRes = await fetch(
              `/api/accounting/payroll/${e.id}?year=${year}&month=${month}`
            );
            if (!pRes.ok) return e;
            const p = await pRes.json();
            return { ...e, payroll: p };
          } catch {
            return e;
          }
        })
      );
      setEmployees(withPayroll);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function openAdvance(emp: EmployeeSummary) {
    setAdvanceTarget({
      id: emp.id,
      name: emp.name,
      outstanding: emp.payroll?.outstandingAdvance ?? 0,
    });
    setAdvanceAmount("");
    setAdvanceAccount("1010");
    setAdvanceDate(new Date().toISOString().slice(0, 10));
    setAdvanceNote("");
    setAdvanceFiles([]);
    setAdvanceError(null);
  }

  function closeAdvance() {
    if (advanceSubmitting) return;
    setAdvanceTarget(null);
  }

  async function handleSubmitAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!advanceTarget) return;
    setAdvanceError(null);
    const amt = Number(advanceAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setAdvanceError("الرجاء إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    setAdvanceSubmitting(true);
    try {
      const res = await fetch(
        `/api/accounting/payroll/${advanceTarget.id}/advance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            paymentAccount: advanceAccount,
            date: advanceDate,
            note: advanceNote.trim() || undefined,
          }),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "فشل تسجيل السلفة");

      if (advanceFiles.length > 0 && j.entry?.id) {
        const fd = new FormData();
        for (const f of advanceFiles) fd.append("files", f);
        const upRes = await fetch(
          `/api/accounting/journal/${j.entry.id}/attachments`,
          { method: "POST", body: fd }
        );
        if (!upRes.ok) {
          const er = await upRes.json().catch(() => ({}));
          alert(
            "تم تسجيل السلفة لكن فشل رفع بعض المرفقات: " +
              (er.error || "خطأ غير معروف")
          );
        }
      }

      setFlash(
        `✅ تم صرف سلفة ${formatAmount(amt)} د.أ للموظف ${advanceTarget.name} من ${paymentAccountLabel(advanceAccount)} (قيد ${j.entry?.entryNumber ?? ""}).`
      );
      setAdvanceTarget(null);
      await fetchData();
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setAdvanceSubmitting(false);
    }
  }

  const activeEmployees = employees.filter((e) => e.isActive);
  const inactiveEmployees = employees.filter((e) => !e.isActive);

  const totalGross = activeEmployees.reduce(
    (s, e) => s + (e.payroll?.gross ?? 0),
    0
  );
  const totalNet = activeEmployees.reduce(
    (s, e) => s + (e.payroll?.net ?? 0),
    0
  );
  const totalAdvances = activeEmployees.reduce(
    (s, e) => s + (e.payroll?.outstandingAdvance ?? 0),
    0
  );

  return (
    <PageShell>
      <PageHeader
        title="الرواتب والأجور"
        icon={<Receipt size={24} />}
        backHref="/accounting"
      />

      {/* Period */}
      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-500 shrink-0">استحقاقات شهر:</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm min-w-0"
        >
          {ARABIC_MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="2025"
          max="2030"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm w-24"
        />
      </div>

      {/* Summary cards */}
      <KpiGrid>
        <SummaryCard
          label="إجمالي المستحق"
          value={totalGross}
          color="text-gray-800"
        />
        <SummaryCard
          label="إجمالي الصافي"
          value={totalNet}
          color="text-green-700"
        />
        <SummaryCard
          label="سلف قائمة"
          value={totalAdvances}
          color="text-red-700"
        />
      </KpiGrid>

      {flash && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-800">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span className="flex-1">{flash}</span>
          <button
            onClick={() => setFlash(null)}
            className="p-1 rounded hover:bg-green-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
        <>
          <EmployeeTable
            title="موظفون نشطون"
            rows={activeEmployees}
            year={year}
            month={month}
            onAdvance={canAdvance ? openAdvance : undefined}
          />
          {inactiveEmployees.length > 0 && (
            <EmployeeTable
              title="موظفون منتهو الخدمة"
              rows={inactiveEmployees}
              year={year}
              month={month}
              inactive
            />
          )}
        </>
      )}

      {advanceTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAdvance();
          }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2 min-w-0">
                <HandCoins size={20} className="text-amber-600 shrink-0" />
                <span className="truncate">
                  صرف سلفة — {advanceTarget.name}
                </span>
              </h3>
              <button
                type="button"
                onClick={closeAdvance}
                disabled={advanceSubmitting}
                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors shrink-0 disabled:opacity-50"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitAdvance}
              className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1"
            >
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
                السلفة تُسجَّل كحقّ على الموظف في حساب{" "}
                <span className="font-semibold">2110 مستحقات الموظفين</span>{" "}
                (وليست مصروفاً). تُخصم تلقائياً من راتبه القادم.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    المبلغ (د.أ)
                  </label>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    required
                    value={advanceDate}
                    onChange={(e) => setAdvanceDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  حساب الدفع
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { code: "1010", label: "الصندوق النقدي", icon: Banknote },
                      { code: "1020", label: "البنك", icon: Banknote },
                      { code: "1030", label: "المحفظة", icon: Wallet },
                    ] as const
                  ).map((a) => (
                    <button
                      key={a.code}
                      type="button"
                      onClick={() => setAdvanceAccount(a.code)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors",
                        advanceAccount === a.code
                          ? "bg-amber-600 text-white border-amber-700 shadow-sm"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-amber-50 hover:border-amber-300"
                      )}
                    >
                      <a.icon size={16} />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ملاحظة (اختياري)
                </label>
                <input
                  type="text"
                  value={advanceNote}
                  onChange={(e) => setAdvanceNote(e.target.value)}
                  placeholder="مثال: سلفة طارئة"
                  maxLength={280}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-500"
                />
              </div>

              <div className="border-t border-gray-100 pt-3">
                <JournalAttachments onPendingFilesChange={setAdvanceFiles} />
              </div>

              {advanceTarget.outstanding > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                  ملاحظة: يوجد سلف قائمة على هذا الموظف بقيمة{" "}
                  <span className="font-bold">
                    {formatAmount(advanceTarget.outstanding)} د.أ
                  </span>{" "}
                  لم تُسترد بعد.
                </div>
              )}

              {advanceError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle size={16} />
                  {advanceError}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeAdvance}
                  disabled={advanceSubmitting}
                  className="px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={advanceSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm disabled:opacity-50"
                >
                  {advanceSubmitting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <HandCoins size={18} />
                  )}
                  تسجيل السلفة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-card-bg rounded-xl p-5 shadow-sm">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={cn("text-2xl font-bold", color)}>
        {formatAmount(value)}{" "}
        <span className="text-sm font-normal text-gray-400">د.أ</span>
      </div>
    </div>
  );
}

function EmployeeTable({
  title,
  rows,
  year,
  month,
  inactive,
  onAdvance,
}: {
  title: string;
  rows: EmployeeSummary[];
  year: number;
  month: number;
  inactive?: boolean;
  onAdvance?: (emp: EmployeeSummary) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
      <div className={cn("px-5 py-3 font-bold", inactive ? "bg-gray-100 text-gray-600" : "bg-green-50 text-green-800")}>
        {title}
      </div>
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="text-right px-4 py-3 font-medium">الموظف</th>
              <th className="text-right px-4 py-3 font-medium">الراتب الأساسي</th>
              <th className="text-right px-4 py-3 font-medium">العمولة</th>
              <th className="text-right px-4 py-3 font-medium">إجمالي</th>
              <th className="text-right px-4 py-3 font-medium">سلف</th>
              <th className="text-right px-4 py-3 font-medium">صافي</th>
              <th className="text-right px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((e) => (
              <tr key={e.id} className={cn(inactive && "opacity-60")}>
                <td className="px-4 py-3">
                  <Link
                    href={`/accounting/parties/${e.id}`}
                    className="inline-flex items-center gap-2 font-medium text-gray-800 hover:text-primary"
                  >
                    <User size={14} className="text-gray-400" />
                    {e.name}
                  </Link>
                  {e.jobTitle && (
                    <span className="block text-xs text-gray-400 mr-6">
                      {e.jobTitle}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {e.baseSalary != null
                    ? `${formatAmount(e.baseSalary)}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-blue-700">
                  {e.payroll
                    ? formatAmount(e.payroll.commission)
                    : "—"}
                </td>
                <td className="px-4 py-3 font-bold text-gray-800">
                  {e.payroll ? formatAmount(e.payroll.gross) : "—"}
                </td>
                <td className="px-4 py-3 text-red-700">
                  {e.payroll && e.payroll.outstandingAdvance > 0
                    ? `-${formatAmount(e.payroll.outstandingAdvance)}`
                    : "—"}
                </td>
                <td className="px-4 py-3 font-bold text-green-700">
                  {e.payroll ? `${formatAmount(e.payroll.net)} د.أ` : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {onAdvance && !inactive && (
                      <button
                        type="button"
                        onClick={() => onAdvance(e)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-colors"
                      >
                        <HandCoins size={12} /> سلفة
                      </button>
                    )}
                    <Link
                      href={`/accounting/payroll/${e.id}?year=${year}&month=${month}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Receipt size={12} /> سليب
                      <ChevronLeft size={12} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-gray-100">
        {rows.map((e) => (
          <div
            key={e.id}
            className={cn("p-3 space-y-2", inactive && "opacity-60")}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/accounting/parties/${e.id}`}
                  className="inline-flex items-center gap-1.5 font-medium text-gray-800 hover:text-primary"
                >
                  <User size={14} className="text-gray-400 shrink-0" />
                  <span className="break-words">{e.name}</span>
                </Link>
                {e.jobTitle && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {e.jobTitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onAdvance && !inactive && (
                  <button
                    type="button"
                    onClick={() => onAdvance(e)}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 active:bg-amber-200 transition-colors"
                  >
                    <HandCoins size={12} /> سلفة
                  </button>
                )}
                <Link
                  href={`/accounting/payroll/${e.id}?year=${year}&month=${month}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Receipt size={12} /> سليب
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-400">الراتب الأساسي</p>
                <p className="font-semibold text-gray-800 tabular-nums">
                  {e.baseSalary != null ? formatAmount(e.baseSalary) : "—"}
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-2">
                <p className="text-gray-400">العمولة</p>
                <p className="font-semibold text-blue-700 tabular-nums">
                  {e.payroll ? formatAmount(e.payroll.commission) : "—"}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-gray-400">إجمالي</p>
                <p className="font-bold text-gray-800 tabular-nums">
                  {e.payroll ? formatAmount(e.payroll.gross) : "—"}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-2">
                <p className="text-gray-400">سلف</p>
                <p className="font-semibold text-red-700 tabular-nums">
                  {e.payroll && e.payroll.outstandingAdvance > 0
                    ? `-${formatAmount(e.payroll.outstandingAdvance)}`
                    : "—"}
                </p>
              </div>
              <div className="col-span-2 bg-green-50 rounded-lg p-2">
                <p className="text-gray-400">صافي</p>
                <p className="font-bold text-green-700 tabular-nums">
                  {e.payroll
                    ? `${formatAmount(e.payroll.net)} د.أ`
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
