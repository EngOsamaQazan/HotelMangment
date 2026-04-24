"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  Loader2,
  AlertCircle,
  TrendingUp,
  Banknote,
  Clock,
  Percent,
  Printer,
  CalendarDays,
} from "lucide-react";
import { cn, formatDate, formatAmount } from "@/lib/utils";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/ui/KpiGrid";

interface Reservation {
  id: number;
  guestName: string;
  numNights: number;
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

interface ReportData {
  period: { month: number; year: number };
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    cashIncome: number;
    bankIncome: number;
    maintenanceCost: number;
    totalReservations: number;
    completedReservations: number;
    activeReservations: number;
    cancelledReservations: number;
  };
  reservations: Reservation[];
}

interface UnitReport {
  unitNumber: string;
  unitType: string;
  reservations: number;
  totalNights: number;
  revenue: number;
  paid: number;
  remaining: number;
  occupancy: number;
}

const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export default function MonthlyReportPage() {
  const [month, setMonth] = useState(0);
  const [year, setYear] = useState(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    setMonth(now.getMonth() + 1);
    setYear(now.getFullYear());
  }, []);

  const fetchReport = useCallback(async () => {
    if (!month || !year) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports?type=monthly&month=${month}&year=${year}`
      );
      if (!res.ok) throw new Error("فشل تحميل التقرير الشهري");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const daysInMonth = new Date(year, month, 0).getDate();

  const unitReports: UnitReport[] = data
    ? buildUnitReports(data.reservations, daysInMonth)
    : [];

  const totals = unitReports.reduce(
    (acc, u) => ({
      reservations: acc.reservations + u.reservations,
      totalNights: acc.totalNights + u.totalNights,
      revenue: acc.revenue + u.revenue,
      paid: acc.paid + u.paid,
      remaining: acc.remaining + u.remaining,
    }),
    { reservations: 0, totalNights: 0, revenue: 0, paid: 0, remaining: 0 }
  );

  const totalOccupancy =
    unitReports.length > 0
      ? unitReports.reduce((sum, u) => sum + u.occupancy, 0) /
        unitReports.length
      : 0;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={fetchReport}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <PageShell>
      <div className="no-print">
        <PageHeader
          title="التقرير الشهري"
          icon={<BarChart3 size={24} />}
          actions={
            <Can permission="reports.monthly:export">
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium tap-44"
              >
                <Printer size={18} />
                <span>طباعة التقرير</span>
              </button>
            </Can>
          }
        />
      </div>

      {/* Month/Year Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-card-bg rounded-xl p-3 sm:p-4 shadow-sm no-print">
        <div className="flex items-center gap-2 shrink-0">
          <CalendarDays size={20} className="text-primary shrink-0" />
          <span className="text-sm text-gray-500 sm:hidden">الفترة</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-4 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-sm text-gray-500 shrink-0 hidden sm:inline">
              الشهر:
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary flex-1 sm:flex-none min-w-0"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-sm text-gray-500 shrink-0 hidden sm:inline">
              السنة:
            </label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary flex-1 sm:flex-none min-w-0"
            >
              {Array.from({ length: 5 }, (_, i) => (year || new Date().getFullYear()) - 2 + i).map(
                (y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                )
              )}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          {/* Print Header */}
          <div className="hidden print:block text-center mb-6 pb-3 border-b-2 border-[#0E3B33]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="فندق المفرق"
              style={{ display: "block", margin: "0 auto 6px", maxWidth: 180, height: "auto" }}
            />
            <h2 className="text-xl font-bold" style={{ color: "#0E3B33" }}>
              فندق المفرق — التقرير الشهري
            </h2>
            <p className="text-gray-600">
              {MONTHS[month - 1]} {year}
            </p>
          </div>

          {/* Summary Cards */}
          <KpiGrid>
            <ReportCard
              title="إجمالي الإيرادات"
              value={`${formatAmount(data.summary.totalIncome)} د.أ`}
              icon={TrendingUp}
              color="green"
            />
            <ReportCard
              title="إجمالي المدفوع"
              value={`${formatAmount(data.summary.totalExpenses)} د.أ`}
              icon={Banknote}
              color="red"
            />
            <ReportCard
              title="المتبقي"
              value={`${formatAmount(totals.remaining)} د.أ`}
              icon={Clock}
              color="orange"
            />
            <ReportCard
              title="نسبة الإشغال"
              value={`${totalOccupancy.toFixed(1)}%`}
              icon={Percent}
              color="blue"
            />
          </KpiGrid>

          {/* Unit Reports */}
          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
              <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
                <BarChart3 size={20} className="text-primary shrink-0" />
                <span className="truncate">
                  تفاصيل الوحدات — {MONTHS[month - 1]} {year}
                </span>
              </h2>
            </div>

            {unitReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-4 text-center">
                <BarChart3 size={48} className="mb-3 opacity-50" />
                <p>لا توجد حجوزات في هذا الشهر</p>
              </div>
            ) : (
              <>
                {/* Desktop / print Table ≥ md */}
                <div className="hidden md:block overflow-x-auto print:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="text-right px-4 py-3 font-medium">
                          الوحدة
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          النوع
                        </th>
                        <th className="text-center px-4 py-3 font-medium">
                          عدد الحجوزات
                        </th>
                        <th className="text-center px-4 py-3 font-medium">
                          إجمالي الليالي
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          الإيرادات
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          المدفوع
                        </th>
                        <th className="text-right px-4 py-3 font-medium">
                          المتبقي
                        </th>
                        <th className="text-center px-4 py-3 font-medium">
                          نسبة الإشغال
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {unitReports.map((u) => (
                        <tr
                          key={u.unitNumber}
                          className="hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="px-4 py-3 font-bold text-gray-800">
                            {u.unitNumber}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {u.unitType === "room" ? "غرفة" : "شقة"}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            {u.reservations}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-700">
                            {u.totalNights}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800 tabular-nums">
                            {formatAmount(u.revenue)}
                          </td>
                          <td className="px-4 py-3 text-success font-medium tabular-nums">
                            {formatAmount(u.paid)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 font-medium tabular-nums",
                              u.remaining > 0 ? "text-danger" : "text-gray-400"
                            )}
                          >
                            {formatAmount(u.remaining)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <OccupancyBar value={u.occupancy} />
                          </td>
                        </tr>
                      ))}

                      {/* Total Row */}
                      <tr className="bg-primary/5 font-bold text-gray-800 border-t-2 border-primary/20">
                        <td className="px-4 py-3" colSpan={2}>
                          الإجمالي
                        </td>
                        <td className="px-4 py-3 text-center">
                          {totals.reservations}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {totals.totalNights}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {formatAmount(totals.revenue)}
                        </td>
                        <td className="px-4 py-3 text-success tabular-nums">
                          {formatAmount(totals.paid)}
                        </td>
                        <td className="px-4 py-3 text-danger tabular-nums">
                          {formatAmount(totals.remaining)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {totalOccupancy.toFixed(1)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards < md */}
                <div className="md:hidden divide-y divide-gray-100 print:hidden">
                  {unitReports.map((u) => (
                    <div key={u.unitNumber} className="p-3 sm:p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-base font-bold text-gray-800">
                            {u.unitNumber}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {u.unitType === "room" ? "غرفة" : "شقة"} ·{" "}
                            {u.reservations} حجز · {u.totalNights} ليلة
                          </p>
                        </div>
                        <div className="shrink-0 w-24">
                          <OccupancyBar value={u.occupancy} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-gray-50 rounded-lg py-2 px-1">
                          <p className="text-[10px] text-gray-400 mb-0.5">
                            الإيرادات
                          </p>
                          <p className="font-bold text-gray-800 tabular-nums break-words">
                            {formatAmount(u.revenue)}
                          </p>
                        </div>
                        <div className="bg-green-50 rounded-lg py-2 px-1">
                          <p className="text-[10px] text-gray-400 mb-0.5">
                            المدفوع
                          </p>
                          <p className="font-bold text-success tabular-nums break-words">
                            {formatAmount(u.paid)}
                          </p>
                        </div>
                        <div
                          className={cn(
                            "rounded-lg py-2 px-1",
                            u.remaining > 0 ? "bg-red-50" : "bg-gray-50"
                          )}
                        >
                          <p className="text-[10px] text-gray-400 mb-0.5">
                            المتبقي
                          </p>
                          <p
                            className={cn(
                              "font-bold tabular-nums break-words",
                              u.remaining > 0 ? "text-danger" : "text-gray-500"
                            )}
                          >
                            {formatAmount(u.remaining)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="p-3 sm:p-4 bg-primary/5 border-t-2 border-primary/20 space-y-2">
                    <p className="text-sm font-bold text-gray-800">
                      الإجمالي ({totals.reservations} حجز · {totals.totalNights}{" "}
                      ليلة · {totalOccupancy.toFixed(1)}%)
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="bg-white rounded-lg py-2 px-1 shadow-sm">
                        <p className="text-[10px] text-gray-400 mb-0.5">
                          الإيرادات
                        </p>
                        <p className="font-bold text-gray-800 tabular-nums break-words">
                          {formatAmount(totals.revenue)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg py-2 px-1 shadow-sm">
                        <p className="text-[10px] text-gray-400 mb-0.5">
                          المدفوع
                        </p>
                        <p className="font-bold text-success tabular-nums break-words">
                          {formatAmount(totals.paid)}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg py-2 px-1 shadow-sm">
                        <p className="text-[10px] text-gray-400 mb-0.5">
                          المتبقي
                        </p>
                        <p className="font-bold text-danger tabular-nums break-words">
                          {formatAmount(totals.remaining)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </PageShell>
  );
}

function buildUnitReports(
  reservations: Reservation[],
  daysInMonth: number
): UnitReport[] {
  const unitMap = new Map<string, UnitReport>();

  for (const r of reservations) {
    const key = r.unit.unitNumber;
    if (!unitMap.has(key)) {
      unitMap.set(key, {
        unitNumber: r.unit.unitNumber,
        unitType: r.unit.unitType,
        reservations: 0,
        totalNights: 0,
        revenue: 0,
        paid: 0,
        remaining: 0,
        occupancy: 0,
      });
    }

    const u = unitMap.get(key)!;
    u.reservations += 1;
    u.totalNights += r.numNights;
    u.revenue += parseFloat(r.totalAmount);
    u.paid += parseFloat(r.paidAmount);
    u.remaining += parseFloat(r.remaining);
  }

  for (const u of unitMap.values()) {
    u.occupancy = Math.min(100, (u.totalNights / daysInMonth) * 100);
  }

  return Array.from(unitMap.values()).sort((a, b) =>
    a.unitNumber.localeCompare(b.unitNumber)
  );
}

function ReportCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  icon: typeof TrendingUp;
  color: "green" | "red" | "orange" | "blue";
}) {
  const colors = {
    green: { bg: "bg-green-50", icon: "text-green-600", border: "border-green-200" },
    red: { bg: "bg-red-50", icon: "text-red-600", border: "border-red-200" },
    orange: { bg: "bg-orange-50", icon: "text-orange-600", border: "border-orange-200" },
    blue: { bg: "bg-blue-50", icon: "text-blue-600", border: "border-blue-200" },
  };
  const c = colors[color];

  return (
    <div className={cn("rounded-xl shadow-sm p-3 sm:p-5 border", c.bg, c.border)}>
      <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
        <span className="text-[11px] sm:text-sm text-gray-600 font-medium truncate">
          {title}
        </span>
        <div className={cn("p-1.5 sm:p-2 rounded-lg shrink-0", c.bg)}>
          <Icon size={18} className={c.icon} />
        </div>
      </div>
      <p className="text-sm sm:text-xl font-bold text-gray-800 tabular-nums break-words">
        {value}
      </p>
    </div>
  );
}

function OccupancyBar({ value }: { value: number }) {
  const color =
    value >= 75
      ? "bg-green-500"
      : value >= 50
        ? "bg-blue-500"
        : value >= 25
          ? "bg-yellow-500"
          : "bg-red-400";

  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="flex-1 min-w-0 max-w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
      <span className="text-[11px] text-gray-600 shrink-0 tabular-nums">
        {value.toFixed(0)}%
      </span>
    </div>
  );
}
