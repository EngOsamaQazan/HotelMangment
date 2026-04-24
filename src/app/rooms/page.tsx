"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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
  Users,
  Link2,
  Save,
} from "lucide-react";
import { cn, formatDate, statusLabels, unitTypeLabels } from "@/lib/utils";
import { BedIcon } from "@/components/unit-types/shared";
import { usePermissions } from "@/lib/permissions/client";
import { UnitPhotosPanel } from "@/components/rooms/UnitPhotosPanel";
import { UnitMergePanel } from "@/components/rooms/UnitMergePanel";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";

interface UnitTypeBed {
  id: number;
  bedType: string;
  count: number;
  sleepsExtra: boolean;
}

interface UnitTypeRoom {
  id: number;
  nameAr: string;
  kind: string;
  position: number;
  beds: UnitTypeBed[];
}

interface UnitTypeInfo {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  maxAdults: number;
  maxOccupancy: number;
  hasKitchen: boolean;
  hasBalcony: boolean;
  rooms: UnitTypeRoom[];
}

interface NextReservation {
  id: number;
  guestName: string;
  checkIn: string;
  checkOut: string;
}

interface Unit {
  id: number;
  unitNumber: string;
  type: "room" | "apartment";
  status: "available" | "occupied" | "maintenance";
  unitTypeId: number | null;
  unitType: UnitTypeInfo | null;
  bedSetup: string;
  notes: string | null;
  bookingRoomCode: string | null;
  floor: number;
  mergedPartner: { id: number; unitNumber: string } | null;
  guestName?: string;
  checkOutDate?: string;
  phone?: string;
  checkInDate?: string;
  reservationNotes?: string;
  nextReservation?: NextReservation;
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
  const searchParams = useSearchParams();
  const initialStatus = (() => {
    const s = searchParams.get("status");
    if (s === "available" || s === "occupied" || s === "maintenance") return s;
    return null;
  })();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);

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

  useEffect(() => {
    const s = searchParams.get("status");
    if (s === "available" || s === "occupied" || s === "maintenance") {
      setStatusFilter(s);
    } else if (s === null) {
      setStatusFilter(null);
    }
  }, [searchParams]);

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
    <PageShell>
      <PageHeader title="حالة الغرف والشقق" icon={<BedDouble size={22} />} />

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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3 sm:gap-4">
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
          <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3 sm:gap-4">
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
          onUnitUpdate={(updated) => {
            setUnits((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            setSelectedUnit(updated);
          }}
          onRefresh={fetchUnits}
        />
      )}
    </PageShell>
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
        <div className="flex items-center gap-1.5">
          <span className="text-xl sm:text-2xl font-bold text-primary">
            {unit.unitNumber}
          </span>
          {unit.mergedPartner && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full"
              title={`مدمجة مع الوحدة ${unit.mergedPartner.unitNumber}`}
            >
              <Link2 size={10} /> {unit.mergedPartner.unitNumber}
            </span>
          )}
        </div>
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

      <p className="text-xs text-gray-500 mb-1 truncate">
        {unit.unitType?.nameAr ?? unitTypeLabels[unit.type] ?? unit.type}
      </p>

      {unit.unitType && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-2">
          <Users size={11} className="text-gray-400" />
          <span>{unit.unitType.maxOccupancy} أشخاص</span>
          <span className="text-gray-300">·</span>
          <BedDouble size={11} className="text-gray-400" />
          <span className="truncate">
            {unit.unitType.rooms.reduce((n, r) => n + r.beds.reduce((s, b) => s + (b.bedType === "arabic_floor_seating" ? 0 : b.count), 0), 0)} سرير
          </span>
        </div>
      )}

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

      {unit.status !== "occupied" && unit.nextReservation && (
        <div className="mt-3 pt-3 border-t border-blue-200/60 space-y-1.5 text-right">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
            محجوزة لاحقاً
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <User size={12} className="text-gray-400" />
            <span className="truncate">{unit.nextReservation.guestName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
            <CalendarDays size={12} className="text-gray-400" />
            <span>
              {formatDate(unit.nextReservation.checkIn)} — {formatDate(unit.nextReservation.checkOut)}
            </span>
          </div>
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
  onUnitUpdate,
  onRefresh,
}: {
  unit: Unit;
  onClose: () => void;
  onStatusChange: (unitId: number, status: string) => void;
  updating: boolean;
  onUnitUpdate: (unit: Unit) => void;
  onRefresh?: () => void;
}) {
  const config = statusConfig[unit.status] || statusConfig.available;
  const [notes, setNotes] = useState(unit.notes ?? "");
  const [saving, setSaving] = useState(false);
  const { can } = usePermissions();
  const canEdit = can("rooms:edit");
  const canUploadPhotos = can("unit-photos:upload");
  const canDeletePhotos = can("unit-photos:delete");
  const canViewPhotos = can("unit-photos:view");

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  async function handleSave() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      if (notes !== (unit.notes ?? "")) patch.notes = notes || null;
      if (Object.keys(patch).length === 0) {
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/rooms/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("فشل الحفظ");
      const updated = await res.json();
      onUnitUpdate(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  const isDirty = notes !== (unit.notes ?? "");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[95vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95">
        {/* Header */}
        <div
          className={cn(
            "px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0 gap-2",
            config.bg,
          )}
        >
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-gray-800">
              الوحدة {unit.unitNumber}
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 truncate">
              {unit.unitType?.nameAr ?? unitTypeLabels[unit.type] ?? unit.type}
              {unit.unitType && (
                <span className="text-xs text-gray-400 mr-2">
                  ({unit.unitType.code})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/60 transition-colors shrink-0"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">الحالة الحالية</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full",
                config.badge,
                config.badgeText,
              )}
            >
              {statusLabels[unit.status] || unit.status}
            </span>
          </div>

          {/* Unit Type details */}
          {unit.unitType && (
            <div className="bg-gray-50/80 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-primary-light" />
                <span className="text-gray-600">السعة:</span>
                <b className="text-gray-800">{unit.unitType.maxOccupancy}</b>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">بالغون:</span>
                <b className="text-gray-800">{unit.unitType.maxAdults}</b>
              </div>
              <div className="space-y-1">
                {unit.unitType.rooms.map((room) => (
                  <div key={room.id} className="text-xs">
                    <span className="font-medium text-gray-600">
                      {room.nameAr}:
                    </span>{" "}
                    {room.beds.length === 0 ? (
                      <span className="text-gray-400">بلا سرير</span>
                    ) : (
                      <span className="text-gray-700 inline-flex items-center gap-2 flex-wrap">
                        {room.beds.map((b) => (
                          <span
                            key={b.id}
                            className="inline-flex items-center gap-1"
                          >
                            <BedIcon
                              bedType={b.bedType}
                              size={12}
                              className="text-primary-light"
                            />
                            {b.count > 1 ? `${b.count}× ` : ""}
                            {bedTypeLabelAr(b.bedType)}
                            {b.sleepsExtra && (
                              <span className="text-[10px] text-amber-700">
                                (+1 إضافي)
                              </span>
                            )}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {unit.guestName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">الضيف</span>
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

          {unit.reservationNotes && (
            <div>
              <span className="text-sm text-gray-500 block mb-1">ملاحظات الحجز</span>
              <p className="text-sm text-gray-700 bg-blue-50/50 p-3 rounded-lg">
                {unit.reservationNotes}
              </p>
            </div>
          )}

          {/* Room-merge panel (physical pair with adjoining door) */}
          {canEdit && (
            <UnitMergePanel unit={unit} onUnitUpdate={onRefresh} />
          )}

          {/* Notes editor */}
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">
              ملاحظات الوحدة
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              rows={2}
              placeholder="ملاحظات خاصة بهذه الوحدة (اختياري)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y disabled:bg-gray-50"
            />
          </div>

          {unit.bookingRoomCode && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Link2 size={12} />
              Booking Room: <span className="font-mono">{unit.bookingRoomCode}</span>
            </div>
          )}

          {canViewPhotos && (
            <div className="pt-4 border-t border-gray-100">
              <UnitPhotosPanel
                unitId={unit.id}
                canUpload={canUploadPhotos}
                canDelete={canDeletePhotos}
              />
            </div>
          )}

          {/* Status Change */}
          {canEdit && (
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
                        updating && !isActive && "opacity-50 cursor-not-allowed",
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
          )}
        </div>

        {/* Sticky Save Footer */}
        {canEdit && isDirty && (
          <div className="shrink-0 px-6 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNotes(unit.notes ?? "");
              }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-white text-sm"
            >
              تراجع
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              حفظ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Keep the summarizeBeds import chain lean; labels resolved inline.
function bedTypeLabelAr(bedType: string): string {
  return (
    {
      single: "مفرد",
      double: "مزدوج",
      queen: "Queen",
      king: "King",
      sofa_bed: "كنبة سرير",
      bunk_bed: "طابقين",
      crib: "أطفال",
      arabic_floor_seating: "جلسة عربية",
    }[bedType] ?? bedType
  );
}
