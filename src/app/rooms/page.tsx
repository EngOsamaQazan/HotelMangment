"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BedDouble,
  Home,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  User,
  CalendarDays,
} from "lucide-react";
import { cn, formatDate, statusLabels, unitTypeLabels } from "@/lib/utils";

interface Unit {
  id: number;
  unitNumber: string;
  type: "room" | "apartment";
  status: "available" | "occupied" | "maintenance";
  guestName?: string;
  checkOutDate?: string;
  phone?: string;
  checkInDate?: string;
  notes?: string;
}

const statusConfig: Record<
  string,
  { bg: string; border: string; badge: string; badgeText: string; icon: typeof CheckCircle2 }
> = {
  available: {
    bg: "bg-green-50",
    border: "border-green-500",
    badge: "bg-green-100",
    badgeText: "text-green-700",
    icon: CheckCircle2,
  },
  occupied: {
    bg: "bg-red-50",
    border: "border-red-500",
    badge: "bg-red-100",
    badgeText: "text-red-700",
    icon: XCircle,
  },
  maintenance: {
    bg: "bg-yellow-50",
    border: "border-yellow-500",
    badge: "bg-yellow-100",
    badgeText: "text-yellow-700",
    icon: Wrench,
  },
};

function UnitCardSkeleton() {
  return (
    <div className="bg-card-bg rounded-xl shadow-sm p-5 animate-pulse border-r-4 border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="h-7 w-16 bg-gray-200 rounded" />
        <div className="h-5 w-16 bg-gray-200 rounded-full" />
      </div>
      <div className="h-4 w-24 bg-gray-200 rounded mt-2" />
      <div className="h-4 w-20 bg-gray-200 rounded mt-2" />
    </div>
  );
}

type StatusFilter = "available" | "occupied" | "maintenance" | null;

export default function RoomsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms");
      if (!res.ok) throw new Error("فشل تحميل بيانات الوحدات");
      const json = await res.json();
      setUnits(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  async function handleStatusChange(unitId: number, newStatus: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/rooms/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("فشل تحديث الحالة");
      const updated = await res.json();
      setUnits((prev) => prev.map((u) => (u.id === unitId ? updated : u)));
      setSelectedUnit(updated);
    } catch {
      alert("فشل تحديث الحالة");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const statusCounts = {
    available: units.filter((u) => u.status === "available").length,
    occupied: units.filter((u) => u.status === "occupied").length,
    maintenance: units.filter((u) => u.status === "maintenance").length,
  };

  const filteredUnits = statusFilter
    ? units.filter((u) => u.status === statusFilter)
    : units;

  const rooms = filteredUnits.filter((u) => u.type === "room");
  const apartments = filteredUnits.filter((u) => u.type === "apartment");

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchUnits();
          }}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">حالة الغرف والشقق</h1>

      {/* Legend / Filter */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-card-bg rounded-xl shadow-sm p-3 sm:p-4">
        {Object.entries(statusConfig).map(([key, config]) => {
          const Icon = config.icon;
          const isActive = statusFilter === key;
          const count = statusCounts[key as keyof typeof statusCounts];
          return (
            <button
              key={key}
              type="button"
              onClick={() =>
                setStatusFilter((prev) =>
                  prev === key ? null : (key as StatusFilter)
                )
              }
              aria-pressed={isActive}
              title={isActive ? "إلغاء الفلتر" : `تصفية: ${statusLabels[key] || key}`}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full border transition-all cursor-pointer",
                config.badge,
                config.badgeText,
                isActive
                  ? cn(config.border, "ring-2 ring-offset-1 shadow-sm scale-105")
                  : "border-transparent hover:shadow-sm hover:scale-105",
                statusFilter && !isActive && "opacity-60"
              )}
            >
              <Icon size={14} />
              <span>{statusLabels[key] || key}</span>
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/70 text-[11px] font-bold",
                  config.badgeText
                )}
              >
                {count}
              </span>
            </button>
          );
        })}

        {statusFilter && (
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <X size={14} />
            مسح الفلتر
          </button>
        )}
      </div>

      {/* Rooms Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <BedDouble size={22} className="text-primary" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">
            الغرف الفندقية (101-109)
          </h2>
        </div>
        {!loading && rooms.length === 0 ? (
          <div className="bg-card-bg rounded-xl shadow-sm p-6 text-center text-sm text-gray-500">
            لا توجد غرف مطابقة للفلتر الحالي
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {loading
              ? Array.from({ length: 4 }, (_, i) => (
                  <UnitCardSkeleton key={i} />
                ))
              : rooms.map((unit) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    onClick={() => setSelectedUnit(unit)}
                  />
                ))}
          </div>
        )}
      </section>

      {/* Apartments Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Home size={22} className="text-primary" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">
            الشقق المفروشة (01-06)
          </h2>
        </div>
        {!loading && apartments.length === 0 ? (
          <div className="bg-card-bg rounded-xl shadow-sm p-6 text-center text-sm text-gray-500">
            لا توجد شقق مطابقة للفلتر الحالي
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {loading
              ? Array.from({ length: 3 }, (_, i) => (
                  <UnitCardSkeleton key={i} />
                ))
              : apartments.map((unit) => (
                  <UnitCard
                    key={unit.id}
                    unit={unit}
                    onClick={() => setSelectedUnit(unit)}
                  />
                ))}
          </div>
        )}
      </section>

      {/* Unit Detail Modal */}
      {selectedUnit && (
        <UnitModal
          unit={selectedUnit}
          onClose={() => setSelectedUnit(null)}
          onStatusChange={handleStatusChange}
          updating={updatingStatus}
        />
      )}
    </div>
  );
}

function UnitCard({ unit, onClick }: { unit: Unit; onClick: () => void }) {
  const config = statusConfig[unit.status] || statusConfig.available;
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-right rounded-xl shadow-sm p-3 sm:p-5 border-r-4 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer",
        config.bg,
        config.border
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl sm:text-2xl font-bold text-gray-800">
          {unit.unitNumber}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full",
            config.badge,
            config.badgeText
          )}
        >
          <Icon size={12} />
          {statusLabels[unit.status] || unit.status}
        </span>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        {unitTypeLabels[unit.type] || unit.type}
      </p>

      {unit.status === "occupied" && unit.guestName && (
        <div className="mt-3 pt-3 border-t border-gray-200/60 space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm text-gray-700">
            <User size={14} className="text-gray-400" />
            <span className="truncate">{unit.guestName}</span>
          </div>
          {unit.checkOutDate && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <CalendarDays size={13} className="text-gray-400" />
              <span>خروج: {formatDate(unit.checkOutDate)}</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function UnitModal({
  unit,
  onClose,
  onStatusChange,
  updating,
}: {
  unit: Unit;
  onClose: () => void;
  onStatusChange: (unitId: number, status: string) => void;
  updating: boolean;
}) {
  const config = statusConfig[unit.status] || statusConfig.available;

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div
          className={cn(
            "px-6 py-4 flex items-center justify-between",
            config.bg
          )}
        >
          <div>
            <h3 className="text-xl font-bold text-gray-800">
              الوحدة {unit.unitNumber}
            </h3>
            <p className="text-sm text-gray-500">
              {unitTypeLabels[unit.type] || unit.type}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/60 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">الحالة الحالية</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full",
                config.badge,
                config.badgeText
              )}
            >
              {statusLabels[unit.status] || unit.status}
            </span>
          </div>

          {unit.guestName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">النزيل</span>
              <span className="text-sm font-medium text-gray-800">
                {unit.guestName}
              </span>
            </div>
          )}

          {unit.phone && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">الهاتف</span>
              <span className="text-sm text-gray-800 direction-ltr">
                {unit.phone}
              </span>
            </div>
          )}

          {unit.checkInDate && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">تاريخ الدخول</span>
              <span className="text-sm text-gray-800">
                {formatDate(unit.checkInDate)}
              </span>
            </div>
          )}

          {unit.checkOutDate && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">تاريخ الخروج</span>
              <span className="text-sm text-gray-800">
                {formatDate(unit.checkOutDate)}
              </span>
            </div>
          )}

          {unit.notes && (
            <div>
              <span className="text-sm text-gray-500 block mb-1">ملاحظات</span>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                {unit.notes}
              </p>
            </div>
          )}

          {/* Status Change */}
          <div className="pt-4 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-600 mb-3">
              تغيير الحالة
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {Object.entries(statusConfig).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isActive = unit.status === key;
                return (
                  <button
                    key={key}
                    disabled={isActive || updating}
                    onClick={() => onStatusChange(unit.id, key)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? cn(cfg.badge, cfg.badgeText, "cursor-default")
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200",
                      updating && !isActive && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {updating && !isActive ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Icon size={14} />
                    )}
                    {statusLabels[key]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
