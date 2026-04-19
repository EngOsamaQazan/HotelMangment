"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Calendar,
  User,
  BedDouble,
  Printer,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { cn, formatDate, formatAmount } from "@/lib/utils";

interface DebtReservation {
  id: number;
  guestName: string;
  phone: string | null;
  totalAmount: string;
  paidAmount: string;
  remaining: string;
  checkIn: string;
  checkOut: string;
  status: string;
  unit: {
    id: number;
    unitNumber: string;
    unitType: string;
  } | null;
  accountingBalance: number;
  partyId: number | null;
  mismatch: boolean;
}

interface DebtsData {
  asOf: string | null;
  count: number;
  totalRemaining: number;
  totalAccounting: number;
  mismatchCount: number;
  reservations: DebtReservation[];
}

export default function GuestDebtsReportPage() {
  const [asOf, setAsOf] = useState("");
  const [includeSettled, setIncludeSettled] = useState(false);
  const [data, setData] = useState<DebtsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (asOf) params.set("asOf", asOf);
      if (includeSettled) params.set("includeSettled", "1");
      const res = await fetch(
        `/api/accounting/reports/guest-debts?${params}`
      );
      if (!res.ok) throw new Error("فشل تحميل تقرير الديون");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [asOf, includeSettled]);

  useEffect(() => {
    fetchDebts();
  }, [fetchDebts]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={fetchDebts}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b-2 border-gold/30 pb-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-block w-1 h-8 bg-gold rounded-full" />
            <h1 className="text-xl sm:text-2xl font-bold text-primary font-[family-name:var(--font-amiri)]">
              تقرير ذمم النزلاء
            </h1>
          </div>
          <p className="text-xs text-gray-500 mt-1 ms-4">
            الذمم المستحقة على النزلاء بتفصيل الحجز — مربوطة بحساب 1100 ذمم
            النزلاء في النظام المحاسبي
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-gold rounded-lg hover:bg-primary-dark transition-colors text-sm no-print self-start"
        >
          <Printer size={16} />
          طباعة
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 no-print">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full sm:w-auto">
            <label className="block text-xs text-gray-500 mb-1">
              كما في تاريخ (اختياري)
            </label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 pb-2">
            <input
              type="checkbox"
              checked={includeSettled}
              onChange={(e) => setIncludeSettled(e.target.checked)}
              className="w-4 h-4"
            />
            شامل الحجوزات المسددة
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-l from-red-500 to-red-600 rounded-2xl shadow-lg p-5 text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-red-100 text-xs font-medium mb-1">
                    إجمالي الديون المستحقة
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {formatAmount(data.totalRemaining)}
                    <span className="text-sm font-normal text-red-200 mr-1">
                      د.أ
                    </span>
                  </p>
                  <p className="text-red-200 text-xs mt-1">
                    {data.count} حجز مستحق
                  </p>
                </div>
                <div className="bg-white/10 p-3 rounded-2xl shrink-0">
                  <AlertTriangle size={28} className="text-red-100" />
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-l from-sky-500 to-sky-600 rounded-2xl shadow-lg p-5 text-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sky-100 text-xs font-medium mb-1">
                    الرصيد المحاسبي (1100)
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {formatAmount(data.totalAccounting)}
                    <span className="text-sm font-normal text-sky-200 mr-1">
                      د.أ
                    </span>
                  </p>
                  <p className="text-sky-200 text-xs mt-1">
                    من قيود حساب ذمم النزلاء
                  </p>
                </div>
                <div className="bg-white/10 p-3 rounded-2xl shrink-0">
                  <BedDouble size={28} className="text-sky-100" />
                </div>
              </div>
            </div>

            <div
              className={cn(
                "rounded-2xl shadow-lg p-5 text-white",
                data.mismatchCount === 0
                  ? "bg-gradient-to-l from-emerald-500 to-emerald-600"
                  : "bg-gradient-to-l from-amber-500 to-amber-600"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white/80 text-xs font-medium mb-1">
                    تطابق البيانات
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {data.mismatchCount === 0
                      ? "متطابق"
                      : `${data.mismatchCount} فرق`}
                  </p>
                  <p className="text-white/80 text-xs mt-1">
                    بين الحجز والمحاسبة
                  </p>
                </div>
                <div className="bg-white/10 p-3 rounded-2xl shrink-0">
                  {data.mismatchCount === 0 ? (
                    <CheckCircle2 size={28} className="text-white" />
                  ) : (
                    <AlertTriangle size={28} className="text-white" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
            {data.reservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <FileText size={48} className="mb-3 opacity-50" />
                <p className="text-lg font-medium">لا توجد ديون مستحقة</p>
                <p className="text-sm mt-1">جميع الحجوزات مسددة بالكامل</p>
              </div>
            ) : (
              <>
                {/* Desktop */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="text-right px-4 py-3 font-medium">
                          <span className="flex items-center gap-1">
                            <User size={14} />
                            اسم النزيل
                          </span>
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          <span className="flex items-center gap-1">
                            <BedDouble size={14} />
                            الوحدة
                          </span>
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            الإقامة
                          </span>
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          الإجمالي
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          المدفوع
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          المتبقي
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          الرصيد المحاسبي
                        </th>
                        <th className="text-right px-4 py-3 font-medium no-print">
                          إجراءات
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.reservations.map((r) => {
                        const remaining = parseFloat(r.remaining);
                        const total = parseFloat(r.totalAmount);
                        const paidPercent =
                          total > 0
                            ? ((total - remaining) / total) * 100
                            : 0;
                        return (
                          <tr
                            key={r.id}
                            className={cn(
                              "hover:bg-gray-50/50 transition-colors",
                              r.mismatch && "bg-amber-50/40"
                            )}
                          >
                            <td className="px-4 py-3">
                              <div>
                                <span className="font-medium text-gray-800">
                                  {r.guestName}
                                </span>
                                {r.phone && (
                                  <span className="block text-xs text-gray-400 mt-0.5 direction-ltr text-right">
                                    {r.phone}
                                  </span>
                                )}
                                <span className="block text-[11px] text-gray-400 mt-0.5">
                                  حجز #{r.id}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-primary">
                              {r.unit?.unitNumber ?? "-"}
                            </td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                              <div>{formatDate(r.checkIn)}</div>
                              <div className="text-gray-400">
                                ← {formatDate(r.checkOut)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-800 font-medium">
                              {formatAmount(r.totalAmount)}
                            </td>
                            <td className="px-4 py-3 text-success font-medium">
                              <div>
                                {formatAmount(r.paidAmount)}
                                <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 rounded-full"
                                    style={{
                                      width: `${Math.min(100, paidPercent)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold",
                                  remaining > 100
                                    ? "bg-red-100 text-red-700"
                                    : remaining > 0
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-green-100 text-green-700"
                                )}
                              >
                                {formatAmount(r.remaining)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "font-semibold",
                                  r.mismatch
                                    ? "text-amber-700"
                                    : "text-sky-700"
                                )}
                                title={
                                  r.mismatch
                                    ? "لا يطابق remaining"
                                    : "مطابق"
                                }
                              >
                                {formatAmount(r.accountingBalance)}
                                {r.mismatch && (
                                  <AlertTriangle
                                    size={12}
                                    className="inline mr-1 text-amber-600"
                                  />
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3 no-print">
                              <div className="flex items-center gap-1">
                                <Link
                                  href={`/reservations/${r.id}`}
                                  className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded transition-colors"
                                  title="فتح الحجز"
                                >
                                  <BedDouble size={14} />
                                </Link>
                                {r.partyId && (
                                  <Link
                                    href={`/accounting/parties/${r.partyId}`}
                                    className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded transition-colors"
                                    title="كشف حساب النزيل"
                                  >
                                    <ExternalLink size={14} />
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-red-50 font-bold text-gray-800 border-t-2 border-red-200">
                        <td className="px-4 py-3" colSpan={3}>
                          الإجمالي ({data.count} حجز)
                        </td>
                        <td className="px-4 py-3">
                          {formatAmount(
                            data.reservations.reduce(
                              (s, r) => s + parseFloat(r.totalAmount),
                              0
                            )
                          )}
                        </td>
                        <td className="px-4 py-3 text-success">
                          {formatAmount(
                            data.reservations.reduce(
                              (s, r) => s + parseFloat(r.paidAmount),
                              0
                            )
                          )}
                        </td>
                        <td className="px-4 py-3 text-danger">
                          {formatAmount(data.totalRemaining)}
                        </td>
                        <td className="px-4 py-3 text-sky-700">
                          {formatAmount(data.totalAccounting)}
                        </td>
                        <td className="no-print"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile */}
                <div className="md:hidden divide-y divide-gray-100">
                  {data.reservations.map((r) => {
                    const remaining = parseFloat(r.remaining);
                    const total = parseFloat(r.totalAmount);
                    const paidPercent =
                      total > 0 ? ((total - remaining) / total) * 100 : 0;
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "p-4 space-y-3",
                          r.mismatch && "bg-amber-50/40"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-gray-800">
                              {r.guestName}
                            </span>
                            {r.phone && (
                              <span className="block text-xs text-gray-400 mt-0.5 direction-ltr text-right">
                                {r.phone}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-bold text-primary">
                            {r.unit?.unitNumber ?? "-"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          📅 {formatDate(r.checkIn)} — {formatDate(r.checkOut)}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-gray-400 mb-0.5">الإجمالي</p>
                            <p className="font-bold text-gray-800">
                              {formatAmount(r.totalAmount)}
                            </p>
                          </div>
                          <div className="bg-green-50 rounded-lg p-2">
                            <p className="text-gray-400 mb-0.5">المدفوع</p>
                            <p className="font-bold text-green-700">
                              {formatAmount(r.paidAmount)}
                            </p>
                          </div>
                          <div className="bg-red-50 rounded-lg p-2">
                            <p className="text-gray-400 mb-0.5">المتبقي</p>
                            <p className="font-bold text-red-600">
                              {formatAmount(r.remaining)}
                            </p>
                          </div>
                        </div>
                        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{
                              width: `${Math.min(100, paidPercent)}%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-gray-100">
                          <span
                            className={cn(
                              r.mismatch ? "text-amber-700" : "text-sky-700"
                            )}
                          >
                            محاسبياً: {formatAmount(r.accountingBalance)} د.أ
                            {r.mismatch && " ⚠"}
                          </span>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/reservations/${r.id}`}
                              className="text-primary underline"
                            >
                              الحجز
                            </Link>
                            {r.partyId && (
                              <Link
                                href={`/accounting/parties/${r.partyId}`}
                                className="text-primary underline"
                              >
                                كشف النزيل
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="p-4 bg-red-50 text-center">
                    <p className="text-sm text-gray-500 mb-1">
                      إجمالي الديون ({data.count} حجز)
                    </p>
                    <p className="text-xl font-bold text-danger">
                      {formatAmount(data.totalRemaining)} د.أ
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
