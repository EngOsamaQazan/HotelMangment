"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Receipt,
  Printer,
  CheckCircle,
  Wallet,
  Banknote,
  Calculator,
} from "lucide-react";
import { cn, formatAmount, formatDate } from "@/lib/utils";

interface PayrollData {
  party: {
    id: number;
    name: string;
    jobTitle: string | null;
    baseSalary: number;
    commissionRate: number;
    salaryPayDay: number | null;
    hireDate: string | null;
    terminationDate: string | null;
    isActive: boolean;
  };
  period: {
    year: number;
    month: number;
    start: string;
    end: string;
  };
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

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export default function PayrollPage() {
  const params = useParams();
  const partyId = params.partyId as string;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postResult, setPostResult] = useState<string | null>(null);
  const [paymentAccount, setPaymentAccount] = useState<"1010" | "1020" | "1030">("1010");

  const fetchPayroll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPostResult(null);
    try {
      const res = await fetch(
        `/api/accounting/payroll/${partyId}?year=${year}&month=${month}`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "فشل التحميل");
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [partyId, year, month]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  async function handlePost() {
    if (!data) return;
    if (data.net <= 0) {
      alert("الصافي = 0 أو سالب. لا يمكن صرف الراتب.");
      return;
    }
    if (
      !confirm(
        `سيتم تسجيل:\n\n• استحقاق راتب: ${formatAmount(data.gross)} د.أ\n• صرف: ${formatAmount(data.net)} د.أ من ${paymentAccountLabel(paymentAccount)}\n• خصم سلف: ${formatAmount(data.outstandingAdvance)} د.أ\n\nهل أنت متأكد؟`
      )
    ) {
      return;
    }

    setPosting(true);
    try {
      const res = await fetch(`/api/accounting/payroll/${partyId}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          basePay: data.baseSalary,
          commission: data.commission,
          advanceDeduction: data.outstandingAdvance,
          paymentAccount,
          date: new Date().toISOString().slice(0, 10),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "فشل التسجيل");
      setPostResult(
        `✅ تم تسجيل راتب ${ARABIC_MONTHS[month - 1]} ${year} بنجاح.`
      );
      await fetchPayroll();
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطأ");
    } finally {
      setPosting(false);
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center py-20 gap-3">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-danger">{error}</p>
        <Link
          href={`/accounting/parties/${partyId}`}
          className="text-primary hover:underline"
        >
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <Link
          href={`/accounting/parties/${partyId}`}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary"
        >
          <ArrowLeft size={16} /> العودة لملف الموظف
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-800"
          >
            <Printer size={16} /> طباعة السليب
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="bg-card-bg rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3 no-print">
        <span className="text-sm text-gray-500">الشهر:</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border rounded-lg px-3 py-1.5 text-sm"
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
          className="border rounded-lg px-3 py-1.5 text-sm w-24"
        />
      </div>

      {/* Payslip Card (printable) */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 print:shadow-none print:border-0">
        <div className="bg-gradient-to-r from-green-700 to-green-600 text-white p-6 rounded-t-2xl print:rounded-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Receipt size={32} />
              <div>
                <h1 className="text-2xl font-bold">سليب راتب</h1>
                <p className="text-green-100 text-sm">
                  عن شهر {ARABIC_MONTHS[month - 1]} {year}
                </p>
              </div>
            </div>
            <div className="text-right text-sm">
              <p className="text-green-100">فندق فاخر الأصيل</p>
              <p className="text-green-100">
                تاريخ الإصدار: {formatDate(new Date().toISOString())}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Employee info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b">
            <div>
              <div className="text-xs text-gray-500">الاسم</div>
              <div className="font-bold text-gray-800">{data.party.name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">المسمّى الوظيفي</div>
              <div className="font-medium text-gray-800">
                {data.party.jobTitle ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">تاريخ التعيين</div>
              <div className="font-medium text-gray-800">
                {data.party.hireDate
                  ? formatDate(data.party.hireDate)
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">الحالة</div>
              <div className="font-medium">
                {data.party.isActive ? (
                  <span className="text-green-700">نشط</span>
                ) : (
                  <span className="text-red-700">غير نشط</span>
                )}
              </div>
            </div>
          </div>

          {/* Earnings breakdown */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <Calculator size={16} /> تفصيل الاستحقاقات
            </h3>
            <div className="space-y-2">
              <Row
                label="الراتب الأساسي"
                value={data.baseSalary}
                positive
              />
              <Row
                label={`عمولة الإيرادات (${(data.commissionRate * 100).toFixed(2)}% من ${formatAmount(data.roomRevenue)})`}
                value={data.commission}
                positive
              />
              <div className="border-t-2 border-gray-200 pt-2">
                <Row label="إجمالي المستحق" value={data.gross} bold />
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-3">الاستقطاعات</h3>
            <div className="space-y-2">
              <Row
                label="سلف قائمة على الموظف"
                value={data.outstandingAdvance}
                negative
              />
            </div>
          </div>

          {/* Net */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-green-700 font-medium">
                  الصافي المستحق
                </div>
                <div className="text-3xl font-bold text-green-800 mt-1">
                  {formatAmount(data.net)}
                  <span className="text-lg font-normal mr-2">د.أ</span>
                </div>
              </div>
              <Receipt size={48} className="text-green-300" />
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-6 pt-8 border-t">
            <div className="text-center">
              <div className="border-t-2 border-gray-300 pt-2 mt-12">
                <p className="text-sm text-gray-500">توقيع المحاسب</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t-2 border-gray-300 pt-2 mt-12">
                <p className="text-sm text-gray-500">توقيع الموظف</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post action */}
      <div className="bg-card-bg rounded-xl shadow-sm p-5 space-y-4 no-print">
        <h3 className="text-sm font-bold text-gray-700">
          تسجيل صرف الراتب في الدفاتر
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-gray-600">حساب الدفع:</label>
          <div className="flex gap-2">
            {(
              [
                { code: "1010", label: "الصندوق النقدي", icon: Banknote },
                { code: "1020", label: "البنك", icon: Banknote },
                { code: "1030", label: "المحفظة", icon: Wallet },
              ] as const
            ).map((a) => (
              <button
                key={a.code}
                onClick={() => setPaymentAccount(a.code)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors",
                  paymentAccount === a.code
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                )}
              >
                <a.icon size={16} />
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handlePost}
          disabled={posting || data.net <= 0}
          className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {posting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <CheckCircle size={18} />
          )}
          تسجيل واعتماد — {formatAmount(data.net)} د.أ
        </button>

        {postResult && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center gap-2">
            <CheckCircle size={16} />
            {postResult}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:block,
          .print\\:block * {
            visibility: visible;
          }
          .print\\:block {
            position: absolute;
            inset: 0;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function Row({
  label,
  value,
  positive,
  negative,
  bold,
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 text-sm",
        bold && "font-bold text-base"
      )}
    >
      <span className={cn("text-gray-700", bold && "text-gray-900")}>
        {label}
      </span>
      <span
        className={cn(
          positive && "text-green-700",
          negative && "text-red-700",
          bold && !positive && !negative && "text-primary"
        )}
      >
        {negative ? "-" : ""}
        {formatAmount(value)} د.أ
      </span>
    </div>
  );
}

function paymentAccountLabel(code: string): string {
  if (code === "1010") return "الصندوق النقدي";
  if (code === "1020") return "البنك";
  if (code === "1030") return "المحفظة الإلكترونية";
  return code;
}
