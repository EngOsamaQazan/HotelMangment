"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Receipt,
  Loader2,
  AlertCircle,
  User,
  ChevronLeft,
} from "lucide-react";
import { cn, formatAmount } from "@/lib/utils";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/ui/KpiGrid";

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

export default function PayrollListPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
}: {
  title: string;
  rows: EmployeeSummary[];
  year: number;
  month: number;
  inactive?: boolean;
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
                  <Link
                    href={`/accounting/payroll/${e.id}?year=${year}&month=${month}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Receipt size={12} /> سليب
                    <ChevronLeft size={12} />
                  </Link>
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
              <Link
                href={`/accounting/payroll/${e.id}?year=${year}&month=${month}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
              >
                <Receipt size={12} /> سليب
              </Link>
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
