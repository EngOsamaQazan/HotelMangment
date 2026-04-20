"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BedDouble,
  Plus,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Users,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/client";
import { Can } from "@/components/Can";
import {
  categoryLabel,
  summarizeBeds,
} from "@/components/unit-types/shared";
import { UnitTypeFormModal } from "@/components/unit-types/UnitTypeFormModal";

export interface UnitTypeListItem {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm: number | null;
  hasKitchen: boolean;
  hasBalcony: boolean;
  smokingAllowed: boolean;
  view: string | null;
  bookingRoomId: string | null;
  channelSync: boolean;
  isActive: boolean;
  sortOrder: number;
  rooms: {
    id: number;
    nameAr: string;
    kind: string;
    position: number;
    beds: {
      id: number;
      bedType: string;
      count: number;
      combinable: boolean;
      combinesToType: string | null;
      sleepsExtra: boolean;
      notes: string | null;
    }[];
  }[];
  amenities: { amenity: { id: number; code: string; nameAr: string; category: string } }[];
  photos: { id: number; url: string; isPrimary: boolean }[];
  _count: { units: number };
}

export default function UnitTypesPage() {
  const [types, setTypes] = useState<UnitTypeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { can } = usePermissions();

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/unit-types");
      if (!res.ok) throw new Error("فشل تحميل أنواع الوحدات");
      const json = (await res.json()) as UnitTypeListItem[];
      setTypes(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  async function handleDelete(type: UnitTypeListItem) {
    if (type._count.units > 0) {
      alert(`لا يمكن حذف هذا النوع — هناك ${type._count.units} وحدة مرتبطة به.`);
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف النوع "${type.nameAr}"؟`)) return;
    setDeletingId(type.id);
    try {
      const res = await fetch(`/api/unit-types/${type.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل الحذف");
      }
      fetchTypes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل الحذف");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(type: UnitTypeListItem) {
    try {
      const res = await fetch(`/api/unit-types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !type.isActive }),
      });
      if (!res.ok) throw new Error("فشل التحديث");
      fetchTypes();
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل التحديث");
    }
  }

  const grouped = types.reduce<Record<string, UnitTypeListItem[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  if (error && types.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={fetchTypes}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="pt-2 sm:pt-4 border-b-2 border-gold/30 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block w-1 h-8 bg-gold rounded-full"
            />
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-primary/5 border border-gold/30">
              <BedDouble size={22} className="text-gold-dark" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight">
                أنواع الوحدات
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                قوالب الغرف والشقق — مصدر البيانات الذي سيُزامن مع Booking.com
              </p>
            </div>
          </div>
          <Can permission="settings.unit_types:create">
            <button
              onClick={() => {
                setEditId(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
            >
              <Plus size={18} />
              نوع جديد
            </button>
          </Can>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : types.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
          <BedDouble size={48} className="opacity-50" />
          <p>لا توجد أنواع وحدات بعد</p>
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <section key={category} className="space-y-3">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Home size={18} className="text-primary" />
              {categoryLabel(category)}
              <span className="text-xs font-normal text-gray-400">
                ({items.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "bg-card-bg rounded-xl shadow-sm p-4 border-r-4 transition-all",
                    t.isActive
                      ? "border-primary/40 hover:shadow-md"
                      : "border-gray-300 opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {t.code}
                        </span>
                        {!t.isActive && (
                          <span className="text-[10px] text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                            معطّل
                          </span>
                        )}
                        {t.channelSync && (
                          <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            Booking
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-800 mt-1 truncate">
                        {t.nameAr}
                      </h3>
                      <p className="text-xs text-gray-500 direction-ltr text-right mt-0.5 truncate">
                        {t.nameEn}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {can("settings.unit_types:edit") && (
                        <button
                          onClick={() => handleToggleActive(t)}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            t.isActive
                              ? "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                              : "text-green-500 hover:bg-green-50",
                          )}
                          title={t.isActive ? "تعطيل" : "تفعيل"}
                        >
                          {t.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      )}
                      {can("settings.unit_types:edit") && (
                        <button
                          onClick={() => {
                            setEditId(t.id);
                            setShowForm(true);
                          }}
                          className="p-1.5 text-primary-light hover:text-primary hover:bg-gold-soft rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      {can("settings.unit_types:delete") && (
                        <button
                          onClick={() => handleDelete(t)}
                          disabled={deletingId === t.id || t._count.units > 0}
                          className="p-1.5 text-red-400 hover:text-danger hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            t._count.units > 0
                              ? `لا يمكن الحذف — ${t._count.units} وحدة مرتبطة`
                              : "حذف"
                          }
                        >
                          {deletingId === t.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users size={14} className="text-primary-light" />
                      <span>السعة القصوى: <b className="text-gray-800">{t.maxOccupancy}</b></span>
                      <span className="text-gray-400">·</span>
                      <span>بالغون: <b className="text-gray-800">{t.maxAdults}</b></span>
                    </div>
                    <div className="flex items-start gap-2 text-gray-600">
                      <BedDouble size={14} className="text-primary-light mt-0.5 shrink-0" />
                      <span className="text-xs leading-relaxed">
                        {summarizeBeds(t.rooms)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.rooms.map((r) => (
                        <span
                          key={r.id}
                          className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                        >
                          {r.nameAr}
                        </span>
                      ))}
                      {t._count.units > 0 && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded ms-auto">
                          {t._count.units} وحدة
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {showForm && (
        <UnitTypeFormModal
          id={editId}
          onClose={() => {
            setShowForm(false);
            setEditId(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditId(null);
            fetchTypes();
          }}
        />
      )}
    </div>
  );
}
