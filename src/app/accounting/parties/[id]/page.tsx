"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  FileText,
  ArrowLeft,
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
} from "lucide-react";
import { cn, formatAmount, formatDate } from "@/lib/utils";

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
  guest: "نزيل",
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <Link
          href="/accounting/parties"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary"
        >
          <ArrowLeft size={16} /> العودة للقائمة
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/accounting/parties?edit=${id}`}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Pencil size={16} /> تعديل
          </Link>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark"
          >
            <Printer size={16} /> طباعة
          </button>
        </div>
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
            <Link
              href={`/accounting/payroll/${id}`}
              className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
            >
              <Receipt size={14} /> سليب الراتب
            </Link>
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

      <div className="bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm flex flex-wrap items-center gap-3 no-print">
        <span className="text-sm text-gray-500">الفترة:</span>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">من</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">إلى</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="text-xs text-danger hover:underline"
          >
            مسح
          </button>
        )}
      </div>

      <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        {data.rows.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400">
            <FileText size={48} className="mb-3 opacity-50" />
            <p>لا توجد حركات في هذه الفترة</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                {from && (
                  <tr className="bg-blue-50/40 font-medium">
                    <td className="px-4 py-3" colSpan={6}>
                      رصيد أول المدة
                    </td>
                    <td className="px-4 py-3 font-bold">
                      {formatAmount(data.openingBalance)}
                    </td>
                  </tr>
                )}
                {data.rows.map((r) => (
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
              </tbody>
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
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
