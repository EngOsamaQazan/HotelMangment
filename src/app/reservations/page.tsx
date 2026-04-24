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
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/ui/KpiGrid";
import { FilterBar } from "@/components/ui/FilterBar";
import {
  ResponsiveTable,
  type ResponsiveTableColumn,
} from "@/components/ui/ResponsiveTable";

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
  source?: string | null;
  confirmationCode?: string | null;
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
  upcoming: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-800",
};

interface CountsResponse {
  active: number;
  upcoming: number;
  completed: number;
  cancelled: number;
  startingToday: number;
  endingToday: number;
  upcomingThisWeek: number;
  onlineTotal?: number;
  onlineToday?: number;
}

type TabKey = "active" | "upcoming" | "completed" | "cancelled" | "online" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "سارية" },
  { key: "upcoming", label: "قادمة" },
  { key: "online", label: "عبر الموقع" },
  { key: "completed", label: "منتهية" },
  { key: "cancelled", label: "ملغاة" },
  { key: "all", label: "الكل" },
];

export default function ReservationsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TabKey>("active");
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState<CountsResponse | null>(null);
  const limit = 20;

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter === "online") {
        params.set("source", "direct_web");
      } else if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
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

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/reservations/summary");
      if (!res.ok) return;
      const json: CountsResponse = await res.json();
      setSummary(json);
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns: ResponsiveTableColumn<Reservation>[] = [
    {
      key: "id",
      label: "رقم",
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-gray-700">{r.id}</span>
          <SourceBadge source={r.source} />
        </div>
      ),
    },
    {
      key: "guest",
      label: "اسم الضيف",
      cell: (r) => (
        <div className="font-medium text-gray-800">
          {r.guestName}
          {r.confirmationCode && (
            <div
              className="text-[10px] text-amber-700 font-mono mt-0.5"
              dir="ltr"
            >
              {r.confirmationCode}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "unit",
      label: "الوحدة",
      cell: (r) => <span className="text-gray-600">{r.unit.unitNumber}</span>,
    },
    {
      key: "stayType",
      label: "نوع الإقامة",
      cell: (r) => (
        <span className="text-gray-600">
          {stayTypeLabels[r.stayType] || r.stayType}
        </span>
      ),
    },
    {
      key: "checkIn",
      label: "الدخول",
      cell: (r) => (
        <span className="text-gray-600 whitespace-nowrap">
          {formatDate(r.checkIn)}
        </span>
      ),
    },
    {
      key: "checkOut",
      label: "الخروج",
      cell: (r) => (
        <span className="text-gray-600 whitespace-nowrap">
          {formatDate(r.checkOut)}
        </span>
      ),
    },
    {
      key: "total",
      label: "المبلغ",
      cell: (r) => (
        <span className="text-gray-700 font-medium whitespace-nowrap">
          {formatAmount(r.totalAmount)}
        </span>
      ),
    },
    {
      key: "paid",
      label: "المدفوع",
      cell: (r) => (
        <span className="text-green-700 font-medium whitespace-nowrap">
          {formatAmount(r.paidAmount)}
        </span>
      ),
    },
    {
      key: "remaining",
      label: "المتبقي",
      cell: (r) => (
        <span
          className={cn(
            "font-medium whitespace-nowrap",
            parseFloat(r.remaining) > 0 ? "text-red-600" : "text-gray-500",
          )}
        >
          {formatAmount(r.remaining)}
        </span>
      ),
    },
    {
      key: "status",
      label: "الحالة",
      cell: (r) => (
        <span
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium",
            STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600",
          )}
        >
          {statusLabels[r.status] || r.status}
        </span>
      ),
    },
    {
      key: "actions",
      label: "إجراءات",
      align: "center",
      cell: (r) => (
        <div className="flex items-center justify-center gap-1">
          <Link
            href={`/reservations/${r.id}`}
            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="عرض / تعديل"
          >
            <Eye size={16} />
          </Link>
          <Can permission="reservations:edit">
            <Link
              href={`/reservations/${r.id}`}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="تعديل"
            >
              <Pencil size={16} />
            </Link>
          </Can>
          <Can permission="reservations:print">
            <Link
              href={`/reservations/${r.id}/contract`}
              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="طباعة العقد"
            >
              <FileText size={16} />
            </Link>
          </Can>
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        title="سجل الحجوزات"
        icon={<CalendarCheck size={24} />}
        actions={
          <Can permission="reservations:create">
            <Link
              href="/reservations/new"
              className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors font-medium tap-44"
            >
              <Plus size={18} />
              <span>حجز جديد</span>
            </Link>
          </Can>
        }
      />

      {summary && (
        <KpiGrid>
          <SummaryCard
            label="السارية الآن"
            value={summary.active}
            tone="green"
          />
          <SummaryCard
            label="قادمة اليوم"
            value={summary.startingToday}
            tone="blue"
          />
          <SummaryCard
            label="تنتهي اليوم"
            value={summary.endingToday}
            tone="amber"
          />
          <SummaryCard
            label="قادمة هذا الأسبوع"
            value={summary.upcomingThisWeek}
            tone="indigo"
          />
        </KpiGrid>
      )}

      {/* Tabs: horizontal scroll on < sm to avoid forcing line wraps that
          would steal two or three rows of vertical space on Fold/compact phones. */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-2 min-w-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {TABS.map((t) => {
            const count =
              summary == null
                ? null
                : t.key === "all"
                  ? summary.active +
                    summary.upcoming +
                    summary.completed +
                    summary.cancelled
                  : t.key === "online"
                    ? (summary.onlineTotal ?? 0)
                    : summary[
                        t.key as
                          | "active"
                          | "upcoming"
                          | "completed"
                          | "cancelled"
                      ];
            const isActive = statusFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors tap-44",
                  isActive
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-primary/40 hover:text-primary",
                )}
              >
                <span className="whitespace-nowrap">{t.label}</span>
                {count != null && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[1.5rem] px-1.5 h-5 rounded-full text-[11px] font-semibold",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-gray-100 text-gray-700",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-0">
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="search"
            placeholder="بحث بالاسم أو رقم الهاتف أو الوحدة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
          />
        </div>
      </FilterBar>

      {loading ? (
        <TableSkeleton />
      ) : (
        <>
          <ResponsiveTable
            columns={columns}
            rows={data?.reservations ?? []}
            getRowKey={(r) => r.id}
            mobileCard={(r) => <ReservationCard reservation={r} />}
            emptyState={
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <CalendarCheck size={48} className="mb-3 opacity-50" />
                <p className="text-lg font-medium">لا توجد حجوزات</p>
                <p className="text-sm mt-1">قم بإضافة حجز جديد للبدء</p>
              </div>
            }
          />

          {data && data.total > 0 && (
            <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 px-3 py-2">
              <Pagination
                page={page}
                pageSize={limit}
                total={data.total}
                onChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function ReservationCard({ reservation: r }: { reservation: Reservation }) {
  return (
    <div
      className={cn(
        "bg-white border border-gray-200 rounded-xl p-4 space-y-3",
        r.source === "direct_web" && "bg-amber-50/40 border-amber-200",
      )}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-xs text-gray-400 shrink-0">#{r.id}</span>
          <span className="font-bold text-gray-800 truncate">
            {r.guestName}
          </span>
          <SourceBadge source={r.source} />
        </div>
        <span
          className={cn(
            "shrink-0 px-2.5 py-1 rounded-full text-xs font-medium",
            STATUS_COLORS[r.status] || "bg-gray-100 text-gray-600",
          )}
        >
          {statusLabels[r.status] || r.status}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>🏠 {r.unit.unitNumber}</span>
        <span>{stayTypeLabels[r.stayType] || r.stayType}</span>
        <span className="whitespace-nowrap">
          📅 {formatDate(r.checkIn)} — {formatDate(r.checkOut)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-gray-50 rounded-lg p-2 min-w-0">
          <p className="text-gray-400 mb-0.5">المبلغ</p>
          <p className="font-bold text-gray-800 truncate">
            {formatAmount(r.totalAmount)}
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-2 min-w-0">
          <p className="text-gray-400 mb-0.5">المدفوع</p>
          <p className="font-bold text-green-700 truncate">
            {formatAmount(r.paidAmount)}
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg p-2 min-w-0",
            parseFloat(r.remaining) > 0 ? "bg-red-50" : "bg-gray-50",
          )}
        >
          <p className="text-gray-400 mb-0.5">المتبقي</p>
          <p
            className={cn(
              "font-bold truncate",
              parseFloat(r.remaining) > 0 ? "text-red-600" : "text-gray-500",
            )}
          >
            {formatAmount(r.remaining)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Link
          href={`/reservations/${r.id}`}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-primary bg-primary/5 rounded-lg text-xs font-medium tap-44"
        >
          <Eye size={14} />
          عرض
        </Link>
        <Can permission="reservations:print">
          <Link
            href={`/reservations/${r.id}/contract`}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-amber-600 bg-amber-50 rounded-lg text-xs font-medium tap-44"
          >
            <FileText size={14} />
            العقد
          </Link>
        </Can>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "blue" | "amber" | "indigo";
}) {
  const toneClasses: Record<typeof tone, string> = {
    green: "bg-green-50 border-green-200 text-green-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
  };
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex items-center justify-between shadow-sm min-w-0",
        toneClasses[tone],
      )}
    >
      <span className="text-xs sm:text-sm font-medium truncate">{label}</span>
      <span className="text-xl sm:text-2xl font-bold shrink-0">{value}</span>
    </div>
  );
}

function SourceBadge({ source }: { source?: string | null }) {
  if (!source || source === "staff") return null;
  const map: Record<string, { label: string; className: string }> = {
    direct_web: {
      label: "عبر الموقع",
      className: "bg-amber-100 text-amber-800 border border-amber-200",
    },
    booking_com: {
      label: "Booking.com",
      className: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    },
    whatsapp: {
      label: "واتساب",
      className: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    },
  };
  const cfg = map[source];
  if (!cfg) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
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
