"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  BedDouble,
  DoorOpen,
  CalendarCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  LayoutGrid,
  AlertCircle,
} from "lucide-react";
import { cn, formatDate, formatAmount } from "@/lib/utils";
import { Can } from "@/components/Can";

interface DashboardData {
  stats: {
    totalUnits: number;
    occupied: number;
    available: number;
    activeReservations: number;
  };
  todayActivity: {
    id: number;
    guestName: string;
    unitNumber: string;
    type: "checkin" | "checkout";
  }[];
  debts: {
    totalDebts: number;
    topDebtors: {
      id: number;
      guestName: string;
      amount: number;
    }[];
  };
}

function StatCardSkeleton() {
  return (
    <div className="bg-card-bg rounded-xl shadow-sm p-5 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-3">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-8 w-16 bg-gray-200 rounded" />
        </div>
        <div className="h-12 w-12 bg-gray-200 rounded-xl" />
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-card-bg rounded-xl shadow-sm p-5 animate-pulse">
      <div className="h-5 w-48 bg-gray-200 rounded mb-5" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 w-1/3 bg-gray-200 rounded" />
            <div className="h-4 w-1/4 bg-gray-200 rounded" />
            <div className="h-4 w-1/5 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

const statCards = [
  {
    key: "totalUnits" as const,
    label: "إجمالي الوحدات",
    icon: Building2,
    accent: "bg-gold",
    iconBg: "bg-gold/15",
    iconColor: "text-gold-dark",
    valueColor: "text-primary",
  },
  {
    key: "occupied" as const,
    label: "مشغولة",
    icon: BedDouble,
    accent: "bg-red-500",
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
    valueColor: "text-red-600",
  },
  {
    key: "available" as const,
    label: "شاغرة",
    icon: DoorOpen,
    accent: "bg-green-500",
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    valueColor: "text-green-600",
  },
  {
    key: "activeReservations" as const,
    label: "حجوزات نشطة",
    icon: CalendarCheck,
    accent: "bg-blue-500",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    valueColor: "text-blue-600",
  },
];

export function DashboardHome() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayLabel, setTodayLabel] = useState("");

  useEffect(() => {
    setTodayLabel(formatDate(new Date()));
  }, []);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch("/api/dashboard");
        const json = await res.json();
        if (!res.ok) {
          const apiErr =
            json && typeof json === "object" && "error" in json
              ? String((json as { error: string }).error)
              : "فشل تحميل البيانات";
          throw new Error(apiErr);
        }
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطأ غير متوقع");
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b-2 border-gold/30 pb-3">
        <div className="flex items-center gap-3">
          <span className="inline-block w-1 h-7 bg-gold rounded-full" />
          <h1 className="text-xl sm:text-2xl font-bold text-primary">
            لوحة التحكم
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted" suppressHydrationWarning>
          {todayLabel}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? [1, 2, 3, 4].map((i) => <StatCardSkeleton key={i} />)
          : statCards.map((card) => (
              <div
                key={card.key}
                className="relative bg-card-bg rounded-xl shadow-sm border border-gray-100 p-3 sm:p-5 overflow-hidden transition-all hover:shadow-md hover:-translate-y-0.5"
              >
                <span
                  className={cn(
                    "absolute top-0 inset-x-0 h-[2px]",
                    card.accent
                  )}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-gray-500 mb-1 truncate">
                      {card.label}
                    </p>
                    <p
                      className={cn(
                        "text-xl sm:text-3xl font-bold tabular-nums",
                        card.valueColor
                      )}
                    >
                      {data?.stats[card.key] ?? 0}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "p-2 sm:p-3 rounded-xl shrink-0",
                      card.iconBg
                    )}
                  >
                    <card.icon size={22} className={card.iconColor} />
                  </div>
                </div>
              </div>
            ))}
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Can permission="reservations:create">
          <Link
            href="/reservations/new"
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm border border-gold/30"
          >
            <Plus size={18} />
            <span>حجز جديد</span>
          </Link>
        </Can>
        <Can permission="rooms:view">
          <Link
            href="/rooms"
            className="flex items-center gap-2 px-5 py-2.5 bg-card-bg text-primary rounded-lg hover:bg-gold-soft transition-colors shadow-sm border border-gold/40"
          >
            <LayoutGrid size={18} />
            <span>حالة الغرف</span>
          </Link>
        </Can>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Check-ins / Check-outs */}
        {loading ? (
          <TableSkeleton />
        ) : (
          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden border-t-2 border-gold/50">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gold/20 bg-gold-soft/40">
              <h2 className="text-base sm:text-lg font-bold text-primary">
                عمليات الدخول والخروج اليوم
              </h2>
            </div>
            <div className="p-3 sm:p-5">
              {!data?.todayActivity || data.todayActivity.length === 0 ? (
                <p className="text-center text-muted py-8">
                  لا توجد عمليات اليوم
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">
                          الضيف
                        </th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">
                          الوحدة
                        </th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">
                          النوع
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.todayActivity.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                        >
                          <td className="py-3 px-3 font-medium text-gray-800">
                            {item.guestName}
                          </td>
                          <td className="py-3 px-3 text-gray-600">
                            {item.unitNumber}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full",
                                item.type === "checkin"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-orange-100 text-orange-700"
                              )}
                            >
                              {item.type === "checkin" ? (
                                <ArrowDownCircle size={14} />
                              ) : (
                                <ArrowUpCircle size={14} />
                              )}
                              {item.type === "checkin" ? "دخول" : "خروج"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Outstanding Debts Summary */}
        {loading ? (
          <TableSkeleton />
        ) : (
          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden border-t-2 border-gold/50">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gold/20 bg-gold-soft/40">
              <h2 className="text-base sm:text-lg font-bold text-primary">
                ملخص الديون المستحقة
              </h2>
            </div>
            <div className="p-3 sm:p-5">
              <div className="mb-5 p-4 bg-red-50 rounded-lg text-center">
                <p className="text-sm text-gray-500 mb-1">إجمالي الديون</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatAmount(data?.debts.totalDebts ?? 0)}{" "}
                  <span className="text-sm font-normal">د.أ</span>
                </p>
              </div>

              {!data?.debts.topDebtors ||
              data.debts.topDebtors.length === 0 ? (
                <p className="text-center text-muted py-4">
                  لا توجد ديون مستحقة
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-500">
                    أعلى المدينين
                  </p>
                  {data.debts.topDebtors.map((debtor) => (
                    <div
                      key={debtor.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <span className="font-medium text-gray-800">
                        {debtor.guestName}
                      </span>
                      <span className="text-red-600 font-bold">
                        {formatAmount(debtor.amount)} د.أ
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
