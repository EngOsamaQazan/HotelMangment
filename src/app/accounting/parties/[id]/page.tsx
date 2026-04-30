"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  FileText,
  Loader2,
  AlertCircle,
  User,
  Phone,
  Mail,
  Scale,
  Printer,
  Pencil,
  Briefcase,
  Receipt,
  Scissors,
} from "lucide-react";
import { cn, formatAmount, formatDate } from "@/lib/utils";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";

const PAGE_SIZE = 20;

interface StatementRow {
  id: number;
  date: string;
  entryId: number;
  entryNumber: string;
  description: string;
  lineDescription: string | null;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementData {
  party: {
    id: number;
    name: string;
    type: string;
    phone: string | null;
    email: string | null;
    nationalId: string | null;
    notes: string | null;
    isActive: boolean;
    userId: number | null;
    jobTitle: string | null;
    baseSalary: number | null;
    commissionRate: number | null;
    salaryPayDay: number | null;
    hireDate: string | null;
    terminationDate: string | null;
  };
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  rows: StatementRow[];
}

interface PayrollData {
  period: { year: number; month: number };
  roomRevenue: number;
  baseSalary: number;
  commissionRate: number;
  commission: number;
  gross: number;
  outstandingAdvance: number;
  empLiabBalance: number;
  advancesThisPeriod: number;
  paymentsThisPeriod: number;
  net: number;
}

const TYPE_LABELS: Record<string, string> = {
  guest: "ضيف",
  partner: "شريك",
  supplier: "مورّد",
  employee: "موظف",
  lender: "مُقرض",
  other: "أخرى",
};

export default function PartyStatementPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<StatementData | null>(null);
  const [payroll, setPayroll] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Reset pagination when filters change.
  useEffect(() => {
    setPage(1);
  }, [id, from, to]);

  const pagedRows = usePaginatedSlice(data?.rows ?? [], page, PAGE_SIZE);
  const totalRows = data?.rows.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const isFirstPage = page === 1;
  const isLastPage = page >= totalPages;

  const fetchStatement = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(
        `/api/accounting/parties/${id}/statement?${qs}`
      );
      if (!res.ok) throw new Error("فشل التحميل");
      const json = await res.json();
      setData(json);

      if (json?.party?.type === "employee") {
        const now = new Date();
        const pRes = await fetch(
          `/api/accounting/payroll/${id}?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
        );
        if (pRes.ok) {
          setPayroll(await pRes.json());
        }
      } else {
        setPayroll(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [id, from, to]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  if (error) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-danger">{error}</p>
        <Link href="/accounting/parties" className="text-primary hover:underline">
          العودة
        </Link>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const balance = data.closingBalance;

  return (
    <PageShell>
      <div className="no-print">
        <PageHeader
          title={data.party.name}
          description={TYPE_LABELS[data.party.type]}
          icon={<User size={22} />}
          backHref="/accounting/parties"
          actions={
            <>
              <Can permission="accounting.parties:edit">
                <Link
                  href={`/accounting/parties?edit=${id}`}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 tap-44"
                >
                  <Pencil size={16} /> <span>تعديل</span>
                </Link>
              </Can>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark tap-44"
              >
                <Printer size={16} /> <span>طباعة</span>
              </button>
            </>
          }
        />
      </div>

      <div className="bg-card-bg rounded-xl shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-primary/10 rounded-xl">
            <User size={28} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-primary">
              {data.party.name}
            </h1>
            <span className="text-sm text-gray-500">
              {TYPE_LABELS[data.party.type]}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          {data.party.phone && (
            <span className="inline-flex items-center gap-1 direction-ltr">
              <Phone size={14} /> {data.party.phone}
            </span>
          )}
          {data.party.email && (
            <span className="inline-flex items-center gap-1 direction-ltr">
              <Mail size={14} /> {data.party.email}
            </span>
          )}
          {data.party.nationalId && (
            <span className="inline-flex items-center gap-1">
              رقم وطني: {data.party.nationalId}
            </span>
          )}
          {data.party.userId != null && (
            <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded text-xs font-medium">
              <User size={12} /> مرتبط بمستخدم النظام #{data.party.userId}
            </span>
          )}
        </div>
        {data.party.notes && (
          <p className="text-sm text-gray-500">{data.party.notes}</p>
        )}
      </div>

      <div
        className={cn(
          "rounded-2xl shadow-sm p-6 border",
          balance > 0
            ? "bg-green-50 border-green-200"
            : balance < 0
            ? "bg-red-50 border-red-200"
            : "bg-gray-50 border-gray-200"
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 font-medium mb-1">
              الرصيد الحالي
            </p>
            <p
              className={cn(
                "text-3xl font-bold",
                balance > 0
                  ? "text-green-700"
                  : balance < 0
                  ? "text-red-700"
                  : "text-gray-500"
              )}
            >
              {formatAmount(Math.abs(balance))}{" "}
              <span className="text-sm font-normal">د.أ</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {balance > 0
                ? "رصيد مدين (عليه للفندق)"
                : balance < 0
                ? "رصيد دائن (له على الفندق)"
                : "لا يوجد رصيد"}
            </p>
          </div>
          <Scale size={40} className="opacity-40" />
        </div>
      </div>

      {data.party.type === "employee" && (
        <div className="bg-card-bg rounded-xl shadow-sm p-5 space-y-4 border border-green-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase size={20} className="text-green-700" />
              <h3 className="text-base font-bold text-green-800">
                بيانات الموظف والاستحقاقات
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Can permission="accounting.parties:manage_deductions">
                <Link
                  href={`/accounting/payroll/${id}/deductions`}
                  className="inline-flex items-center gap-1 text-xs bg-white text-primary border border-gold/40 px-3 py-1.5 rounded-lg hover:bg-gold-soft"
                >
                  <Scissors size={14} /> الاقتطاعات
                </Link>
              </Can>
              <Link
                href={`/accounting/payroll/${id}`}
                className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
              >
                <Receipt size={14} /> سليب الراتب
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-gray-500">المسمّى</div>
              <div className="font-medium text-gray-800">
                {data.party.jobTitle ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">الراتب الأساسي</div>
              <div className="font-bold text-gray-800">
                {data.party.baseSalary != null
                  ? `${formatAmount(data.party.baseSalary)} د.أ`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">نسبة العمولة</div>
              <div className="font-bold text-gray-800">
                {data.party.commissionRate != null
                  ? `${(data.party.commissionRate * 100).toFixed(2)}%`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">يوم الاستحقاق</div>
              <div className="font-medium text-gray-800">
                {data.party.salaryPayDay != null
                  ? `اليوم ${data.party.salaryPayDay}`
                  : "—"}
              </div>
            </div>
            {data.party.hireDate && (
              <div>
                <div className="text-xs text-gray-500">تاريخ التعيين</div>
                <div className="font-medium text-gray-800">
                  {formatDate(data.party.hireDate)}
                </div>
              </div>
            )}
            {data.party.terminationDate && (
              <div>
                <div className="text-xs text-gray-500">تاريخ إنهاء الخدمة</div>
                <div className="font-medium text-red-700">
                  {formatDate(data.party.terminationDate)}
                </div>
              </div>
            )}
          </div>

          {payroll && (
            <div className="mt-2 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-sm font-bold text-green-800 mb-3">
                استحقاق شهر {payroll.period.month}/{payroll.period.year} حتى الآن
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                <div>
                  <div className="text-xs text-gray-500">الراتب الأساسي</div>
                  <div className="font-bold text-gray-800">
                    {formatAmount(payroll.baseSalary)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">
                    إيراد الإيجار ({(payroll.commissionRate * 100).toFixed(0)}%)
                  </div>
                  <div className="font-medium text-gray-600">
                    {formatAmount(payroll.roomRevenue)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">العمولة</div>
                  <div className="font-bold text-blue-700">
                    {formatAmount(payroll.commission)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">سلف قائمة</div>
                  <div className="font-bold text-red-700">
                    {formatAmount(payroll.outstandingAdvance)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">الصافي المتوقع</div>
                  <div className="font-bold text-green-700 text-base">
                    {formatAmount(payroll.net)} د.أ
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm no-print">
        <FilterBar>
          <span className="text-sm text-gray-500 shrink-0">الفترة:</span>
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-xs text-gray-400 shrink-0">من</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm w-full min-w-0"
            />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-xs text-gray-400 shrink-0">إلى</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm w-full min-w-0"
            />
          </div>
          {(from || to) && (
            <button
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="text-xs text-danger hover:underline shrink-0"
            >
              مسح
            </button>
          )}
        </FilterBar>
      </div>

      <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        {data.rows.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <FileText size={48} className="mb-3 opacity-50" />
            <p>لا توجد حركات في هذه الفترة</p>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-right px-4 py-3 font-medium">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium">القيد</th>
                  <th className="text-right px-4 py-3 font-medium">البيان</th>
                  <th className="text-right px-4 py-3 font-medium">الحساب</th>
                  <th className="text-right px-4 py-3 font-medium">مدين</th>
                  <th className="text-right px-4 py-3 font-medium">دائن</th>
                  <th className="text-right px-4 py-3 font-medium">الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-primary">
                      <Link
                        href={`/accounting/journal/${r.entryId}`}
                        className="hover:underline"
                      >
                        {r.entryNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {r.description}
                      {r.lineDescription && (
                        <span className="block text-xs text-gray-400 mt-0.5">
                          {r.lineDescription}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {r.accountCode} — {r.accountName}
                    </td>
                    <td className="px-4 py-3 font-medium text-green-700">
                      {r.debit > 0 ? formatAmount(r.debit) : ""}
                    </td>
                    <td className="px-4 py-3 font-medium text-red-700">
                      {r.credit > 0 ? formatAmount(r.credit) : ""}
                    </td>
                    <td className="px-4 py-3 font-bold text-primary">
                      {formatAmount(r.balance)}
                    </td>
                  </tr>
                ))}
                {from && isLastPage && (
                  <tr className="bg-blue-50/40 font-medium">
                    <td className="px-4 py-3" colSpan={6}>
                      رصيد أول المدة
                    </td>
                    <td className="px-4 py-3 font-bold">
                      {formatAmount(data.openingBalance)}
                    </td>
                  </tr>
                )}
              </tbody>
              {isLastPage && (
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-4 py-3" colSpan={4}>
                      الإجمالي
                    </td>
                    <td className="px-4 py-3 text-green-700">
                      {formatAmount(data.totalDebit)}
                    </td>
                    <td className="px-4 py-3 text-red-700">
                      {formatAmount(data.totalCredit)}
                    </td>
                    <td className="px-4 py-3 text-primary">
                      {formatAmount(data.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden">
            <div className="divide-y divide-gray-100">
              {pagedRows.map((r) => (
                <div key={r.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                        <span>{formatDate(r.date)}</span>
                        <Link
                          href={`/accounting/journal/${r.entryId}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {r.entryNumber}
                        </Link>
                      </div>
                      <p className="text-sm text-gray-800 mt-1 break-words">
                        {r.description}
                      </p>
                      {r.lineDescription && (
                        <p className="text-xs text-gray-400 mt-0.5 break-words">
                          {r.lineDescription}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                        {r.accountCode} — {r.accountName}
                      </p>
                    </div>
                    <span className="font-bold text-primary text-sm tabular-nums shrink-0">
                      {formatAmount(r.balance)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-green-700">
                      مدين: {r.debit > 0 ? formatAmount(r.debit) : "—"}
                    </span>
                    <span className="text-red-700">
                      دائن: {r.credit > 0 ? formatAmount(r.credit) : "—"}
                    </span>
                  </div>
                </div>
              ))}
              {from && isLastPage && (
                <div className="p-3 bg-blue-50/40 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-700">رصيد أول المدة</span>
                  <span className="font-bold tabular-nums">
                    {formatAmount(data.openingBalance)}
                  </span>
                </div>
              )}
              {isLastPage && (
                <div className="p-3 bg-gray-100 grid grid-cols-3 gap-2 text-xs font-bold tabular-nums">
                  <span className="text-green-700">
                    {formatAmount(data.totalDebit)}
                  </span>
                  <span className="text-red-700">
                    {formatAmount(data.totalCredit)}
                  </span>
                  <span className="text-primary text-left">
                    {formatAmount(data.closingBalance)}
                  </span>
                </div>
              )}
            </div>
          </div>
          {/* Pagination wrapper */}
          <div>
            {data.rows.length > 0 && (
              <div className="px-4 py-3 border-t border-gold/20">
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={data.rows.length}
                  onChange={setPage}
                />
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </PageShell>
  );
}
