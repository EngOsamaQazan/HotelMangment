"use client";

import { useEffect, useState, useCallback } from "react";
import {
  FileText,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Calendar,
  User,
  BedDouble,
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
  };
}

interface DebtsData {
  totalDebts: number;
  count: number;
  reservations: DebtReservation[];
}

export default function DebtsReportPage() {
  const [data, setData] = useState<DebtsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports?type=debts");
      if (!res.ok) throw new Error("فشل تحميل تقرير الديون");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, []);

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
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">تقرير الديون</h1>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          {/* Total Debts Card */}
          <div className="bg-gradient-to-l from-red-500 to-red-600 rounded-2xl shadow-lg p-5 sm:p-8 text-white">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-red-100 text-xs sm:text-sm font-medium mb-2">
                  إجمالي الديون المستحقة
                </p>
                <p className="text-2xl sm:text-4xl font-bold">
                  {formatAmount(data.totalDebts)}{" "}
                  <span className="text-sm sm:text-lg font-normal text-red-200">د.أ</span>
                </p>
                <p className="text-red-200 text-xs sm:text-sm mt-2">
                  {data.count} حجز مستحق السداد
                </p>
              </div>
              <div className="bg-white/10 p-3 sm:p-4 rounded-2xl shrink-0">
                <AlertTriangle size={28} className="text-red-100 sm:hidden" />
                <AlertTriangle size={40} className="text-red-100 hidden sm:block" />
              </div>
            </div>
          </div>

          {/* Debts Table */}
          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
            {data.reservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <FileText size={48} className="mb-3 opacity-50" />
                <p className="text-lg font-medium">لا توجد ديون مستحقة</p>
                <p className="text-sm mt-1">جميع الحجوزات مسددة بالكامل</p>
              </div>
            ) : (
              <>
              {/* Desktop Table */}
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className="text-right px-4 py-3 font-medium">
                        <span className="flex items-center gap-1">
                          <User size={14} />
                          اسم الضيف
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
                          تاريخ الدخول
                        </span>
                      </th>
                      <th className="text-right px-4 py-3 font-medium">
                        تاريخ الخروج
                      </th>
                      <th className="text-right px-4 py-3 font-medium">
                        المبلغ الإجمالي
                      </th>
                      <th className="text-right px-4 py-3 font-medium">
                        المدفوع
                      </th>
                      <th className="text-right px-4 py-3 font-medium">
                        المتبقي
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
                          className="hover:bg-gray-50/50 transition-colors"
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
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-primary">
                            {r.unit.unitNumber}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {formatDate(r.checkIn)}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {formatDate(r.checkOut)}
                          </td>
                          <td className="px-4 py-3 text-gray-800 font-medium">
                            {formatAmount(r.totalAmount)} د.أ
                          </td>
                          <td className="px-4 py-3 text-success font-medium">
                            <div>
                              {formatAmount(r.paidAmount)} د.أ
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
                                  : "bg-orange-100 text-orange-700"
                              )}
                            >
                              {formatAmount(r.remaining)} د.أ
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Summary Footer */}
                  <tfoot>
                    <tr className="bg-red-50 font-bold text-gray-800 border-t-2 border-red-200">
                      <td className="px-4 py-3" colSpan={4}>
                        الإجمالي ({data.count} حجز)
                      </td>
                      <td className="px-4 py-3">
                        {formatAmount(
                          data.reservations.reduce(
                            (sum, r) => sum + parseFloat(r.totalAmount),
                            0
                          )
                        )}{" "}
                        د.أ
                      </td>
                      <td className="px-4 py-3 text-success">
                        {formatAmount(
                          data.reservations.reduce(
                            (sum, r) => sum + parseFloat(r.paidAmount),
                            0
                          )
                        )}{" "}
                        د.أ
                      </td>
                      <td className="px-4 py-3 text-danger">
                        {formatAmount(data.totalDebts)} د.أ
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {data.reservations.map((r) => {
                  const remaining = parseFloat(r.remaining);
                  const total = parseFloat(r.totalAmount);
                  const paidPercent =
                    total > 0 ? ((total - remaining) / total) * 100 : 0;
                  return (
                    <div key={r.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-gray-800">{r.guestName}</span>
                          {r.phone && (
                            <span className="block text-xs text-gray-400 mt-0.5 direction-ltr text-right">{r.phone}</span>
                          )}
                        </div>
                        <span className="text-sm font-bold text-primary">{r.unit.unitNumber}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        📅 {formatDate(r.checkIn)} — {formatDate(r.checkOut)}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-gray-50 rounded-lg p-2">
                          <p className="text-gray-400 mb-0.5">الإجمالي</p>
                          <p className="font-bold text-gray-800">{formatAmount(r.totalAmount)}</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-2">
                          <p className="text-gray-400 mb-0.5">المدفوع</p>
                          <p className="font-bold text-green-700">{formatAmount(r.paidAmount)}</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-2">
                          <p className="text-gray-400 mb-0.5">المتبقي</p>
                          <p className="font-bold text-red-600">{formatAmount(r.remaining)}</p>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${Math.min(100, paidPercent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="p-4 bg-red-50 text-center">
                  <p className="text-sm text-gray-500 mb-1">إجمالي الديون ({data.count} حجز)</p>
                  <p className="text-xl font-bold text-danger">{formatAmount(data.totalDebts)} د.أ</p>
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
