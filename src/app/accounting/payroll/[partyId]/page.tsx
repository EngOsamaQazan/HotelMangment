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
  AlertTriangle,
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
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark border border-gold/40 shadow-md transition-colors"
          >
            <Printer size={16} /> طباعة السليب
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="bg-card-bg rounded-xl p-4 shadow-sm border border-gold/20 flex flex-wrap items-center gap-3 no-print">
        <span className="text-sm text-primary font-medium">الشهر:</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border border-gold/30 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-gold/40 focus:border-gold outline-none"
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
          className="border border-gold/30 rounded-lg px-3 py-1.5 text-sm w-24 focus:ring-2 focus:ring-gold/40 focus:border-gold outline-none"
        />
      </div>

      {/* Payslip Card (printable) */}
      <div className="bg-white rounded-2xl shadow-lg border border-gold/30 overflow-hidden print:shadow-none print:border-0">
        <div
          className="relative text-white p-6 print:rounded-none"
          style={{
            background:
              "radial-gradient(ellipse at top right, #155A4C 0%, #0E3B33 50%, #092923 100%)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gold/15 blur-3xl"
          />
          <span
            aria-hidden
            className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent"
          />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-gold/15 border border-gold/40">
                <Receipt size={28} className="text-gold" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gold font-[family-name:var(--font-amiri)] inline-flex items-baseline gap-2 leading-tight">
                  <span className="text-gold-light text-lg leading-none select-none">
                    ◆
                  </span>
                  سليب راتب
                </h1>
                <p className="text-gold-light/90 text-sm mt-1">
                  عن شهر {ARABIC_MONTHS[month - 1]} {year}
                </p>
              </div>
            </div>
            <div className="text-left text-xs sm:text-sm space-y-0.5">
              <p className="text-gold font-bold font-[family-name:var(--font-amiri)] text-base">
                فندق المفرق
              </p>
              <p className="text-gold-light/75">
                تاريخ الإصدار: {formatDate(new Date().toISOString())}
              </p>
            </div>
          </div>
        </div>

        {(() => {
          const today = new Date();
          const monthEnd = new Date(Date.UTC(year, month, 0));
          const isFuture =
            today.getFullYear() < year ||
            (today.getFullYear() === year && today.getMonth() + 1 < month);
          const isCurrentMonth =
            today.getFullYear() === year && today.getMonth() + 1 === month;
          if (isFuture) {
            return (
              <div className="mx-6 mt-4 p-4 bg-red-50 border-2 border-red-300 rounded-xl flex items-start gap-3">
                <AlertTriangle size={22} className="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-red-800 text-sm">
                    شهر مستقبلي — السليب غير مؤهل للإصدار
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    شهر {ARABIC_MONTHS[month - 1]} {year} لم يبدأ بعد. يمكنك
                    عرض التقديرات لكن لا يُنصح بالاعتماد قبل حلوله.
                  </p>
                </div>
              </div>
            );
          }
          if (isCurrentMonth && today < monthEnd) {
            const daysLeft = Math.ceil(
              (monthEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );
            return (
              <div className="mx-6 mt-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-start gap-3">
                <AlertTriangle size={22} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800 text-sm">
                    تنبيه: الشهر لم ينتهِ بعد
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    تاريخ الإصدار أقل من نهاية شهر {ARABIC_MONTHS[month - 1]}{" "}
                    {year} (متبقّي {daysLeft} يوم). القيم المعروضة مبنيّة على
                    الإيرادات المسجّلة حتى هذه اللحظة وقد ترتفع العمولة مع
                    إضافة حجوزات جديدة قبل نهاية الشهر.
                    {data.party.salaryPayDay != null && (
                      <span className="block mt-1">
                        الراتب يُصرف في اليوم {data.party.salaryPayDay} من الشهر
                        التالي.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          }
          return null;
        })()}

        <div className="p-6 space-y-6">
          {/* Employee info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4 border-b border-gold/20">
            <div>
              <div className="text-xs text-gray-500">الاسم</div>
              <div className="font-bold text-primary">{data.party.name}</div>
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
                  <span className="text-success">نشط</span>
                ) : (
                  <span className="text-danger">غير نشط</span>
                )}
              </div>
            </div>
          </div>

          {/* Earnings breakdown */}
          <div>
            <h3 className="text-base font-bold text-primary mb-3 flex items-center gap-2 font-[family-name:var(--font-amiri)]">
              <span className="text-gold-dark text-base leading-none select-none">
                ◆
              </span>
              <Calculator size={18} className="text-gold-dark" /> تفصيل
              الاستحقاقات
            </h3>
            <div className="space-y-2 border-r-2 border-gold/30 pr-3">
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
              <div className="border-t border-gold/40 pt-2">
                <Row label="إجمالي المستحق" value={data.gross} bold />
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h3 className="text-base font-bold text-primary mb-3 flex items-center gap-2 font-[family-name:var(--font-amiri)]">
              <span className="text-gold-dark text-base leading-none select-none">
                ◆
              </span>
              الاستقطاعات
            </h3>
            <div className="space-y-2 border-r-2 border-gold/30 pr-3">
              <Row
                label="سلف قائمة على الموظف"
                value={data.outstandingAdvance}
                negative
              />
            </div>
          </div>

          {/* Net — luxury emerald + gold card */}
          <div
            className="relative rounded-xl p-5 border border-gold/40 shadow-md overflow-hidden"
            style={{
              background:
                "radial-gradient(ellipse at top right, #155A4C 0%, #0E3B33 60%, #092923 100%)",
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 rounded-full bg-gold/15 blur-3xl"
            />
            <div className="relative flex items-center justify-between gap-4">
              <div>
                <div className="text-sm text-gold-light/90 font-medium tracking-wide">
                  الصافي المستحق
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-gold mt-1 font-[family-name:var(--font-amiri)]">
                  {formatAmount(data.net)}
                  <span className="text-lg font-normal mr-2 text-gold-light">
                    د.أ
                  </span>
                </div>
              </div>
              <div className="w-16 h-16 rounded-xl flex items-center justify-center bg-gold/15 border border-gold/40">
                <Receipt size={32} className="text-gold" />
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-6 pt-8 border-t border-gold/20">
            <div className="text-center">
              <div className="border-t-2 border-gold/40 pt-2 mt-12">
                <p className="text-sm text-gray-500">توقيع المحاسب</p>
              </div>
            </div>
            <div className="text-center">
              <div className="border-t-2 border-gold/40 pt-2 mt-12">
                <p className="text-sm text-gray-500">توقيع الموظف</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post action */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gold/20 p-5 space-y-4 no-print">
        <h3 className="text-base font-bold text-primary flex items-center gap-2 font-[family-name:var(--font-amiri)]">
          <span className="text-gold-dark text-base leading-none select-none">
            ◆
          </span>
          تسجيل صرف الراتب في الدفاتر
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-primary font-medium">حساب الدفع:</label>
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
                onClick={() => setPaymentAccount(a.code)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm border transition-colors",
                  paymentAccount === a.code
                    ? "bg-primary text-gold border-gold/50 shadow-sm"
                    : "bg-white text-gray-600 border-gold/25 hover:bg-gold-soft hover:border-gold/50"
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
          className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-gold rounded-lg hover:bg-primary-dark font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-gold/40 shadow-md transition-colors"
        >
          {posting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <CheckCircle size={18} />
          )}
          تسجيل واعتماد — {formatAmount(data.net)} د.أ
        </button>

        {postResult && (
          <div className="p-3 bg-gold-soft border border-gold/40 rounded-lg text-sm text-primary flex items-center gap-2">
            <CheckCircle size={16} className="text-success" />
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
      <span className={cn("text-gray-700", bold && "text-primary")}>
        {label}
      </span>
      <span
        className={cn(
          positive && "text-success",
          negative && "text-danger",
          bold && !positive && !negative && "text-gold-dark"
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
