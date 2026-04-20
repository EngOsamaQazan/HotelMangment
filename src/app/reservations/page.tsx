"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  FileText,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import {
  cn,
  formatDate,
  formatAmount,
  stayTypeLabels,
  statusLabels,
} from "@/lib/utils";
import { Pagination } from "@/components/Pagination";

interface Unit {
  id: number;
  unitNumber: string;
  unitType: string;
}

interface Reservation {
  id: number;
  guestName: string;
  phone: string | null;
  numNights: number;
  stayType: string;
  checkIn: string;
  checkOut: string;
  unitPrice: string;
  totalAmount: string;
  paidAmount: string;
  remaining: string;
  paymentMethod: string | null;
  status: string;
  numGuests: number;
  notes: string | null;
  createdAt: string;
  unit: Unit;
}

interface ApiResponse {
  reservations: Reservation[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-800",
};

export default function ReservationsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await fetch(`/api/reservations?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApiResponse = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarCheck className="text-primary" size={24} />
          <h1 className="text-xl sm:text-2xl font-bold text-primary">سجل الحجوزات</h1>
        </div>
        <Link
          href="/reservations/new"
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg transition-colors font-medium w-full sm:w-auto"
        >
          <Plus size={18} />
          حجز جديد
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="بحث بالاسم أو رقم الهاتف أو الوحدة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm min-w-[160px]"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="completed">منتهي</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <TableSkeleton />
        ) : !data || data.reservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CalendarCheck size={48} className="mb-3 opacity-50" />
            <p className="text-lg font-medium">لا توجد حجوزات</p>
            <p className="text-sm mt-1">قم بإضافة حجز جديد للبدء</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      رقم
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      اسم الضيف
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      الوحدة
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      نوع الإقامة
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      الدخول
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      الخروج
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      المبلغ
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      المدفوع
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      المتبقي
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">
                      الحالة
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">
                      إجراءات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.reservations.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-700">
                        {r.id}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {r.guestName}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.unit.unitNumber}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {stayTypeLabels[r.stayType] || r.stayType}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(r.checkIn)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDate(r.checkOut)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                        {formatAmount(r.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-green-700 font-medium whitespace-nowrap">
                        {formatAmount(r.paidAmount)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 font-medium whitespace-nowrap",
                          parseFloat(r.remaining) > 0
                            ? "text-red-600"
                            : "text-gray-500"
                        )}
                      >
                        {formatAmount(r.remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium",
                            STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600"
                          )}
                        >
                          {statusLabels[r.status] || r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/reservations/${r.id}`}
                            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="عرض / تعديل"
                          >
                            <Eye size={16} />
                          </Link>
                          <Link
                            href={`/reservations/${r.id}`}
                            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                            title="تعديل"
                          >
                            <Pencil size={16} />
                          </Link>
                          <Link
                            href={`/reservations/${r.id}/contract`}
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="طباعة العقد"
                          >
                            <FileText size={16} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden divide-y divide-gray-100">
              {data.reservations.map((r) => (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{r.id}</span>
                      <span className="font-bold text-gray-800">{r.guestName}</span>
                    </div>
                    <span
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium",
                        STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600"
                      )}
                    >
                      {statusLabels[r.status] || r.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>🏠 {r.unit.unitNumber}</span>
                    <span>{stayTypeLabels[r.stayType] || r.stayType}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>📅 {formatDate(r.checkIn)} — {formatDate(r.checkOut)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-400 mb-0.5">المبلغ</p>
                      <p className="font-bold text-gray-800">{formatAmount(r.totalAmount)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2">
                      <p className="text-gray-400 mb-0.5">المدفوع</p>
                      <p className="font-bold text-green-700">{formatAmount(r.paidAmount)}</p>
                    </div>
                    <div className={cn("rounded-lg p-2", parseFloat(r.remaining) > 0 ? "bg-red-50" : "bg-gray-50")}>
                      <p className="text-gray-400 mb-0.5">المتبقي</p>
                      <p className={cn("font-bold", parseFloat(r.remaining) > 0 ? "text-red-600" : "text-gray-500")}>
                        {formatAmount(r.remaining)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/reservations/${r.id}`}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-primary bg-primary/5 rounded-lg text-xs font-medium"
                    >
                      <Eye size={14} />
                      عرض
                    </Link>
                    <Link
                      href={`/reservations/${r.id}/contract`}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-amber-600 bg-amber-50 rounded-lg text-xs font-medium"
                    >
                      <FileText size={14} />
                      العقد
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-gold/20">
              <Pagination
                page={page}
                pageSize={limit}
                total={data.total}
                onChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-center py-10">
        <Loader2 className="animate-spin text-primary" size={32} />
        <span className="mr-3 text-gray-500">جاري تحميل الحجوزات...</span>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: 7 }).map((_, j) => (
            <div
              key={j}
              className="h-4 bg-gray-200 rounded animate-pulse flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
