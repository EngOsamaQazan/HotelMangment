"use client";

import { useEffect, useState } from "react";
import { X, Save, Loader2, AlertCircle, Upload, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UNIT_CATEGORIES } from "./shared";
import {
  BedConfigurator,
  emptyRoom,
  type RoomState,
} from "./BedConfigurator";
import { AmenitiesPicker } from "./AmenitiesPicker";

interface Amenity {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
}

interface Photo {
  id: number;
  url: string;
  captionAr: string | null;
  captionEn: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

interface UnitTypeDetail {
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
    nameAr: string;
    nameEn: string;
    kind: string;
    position: number;
    beds: {
      bedType: string;
      count: number;
      combinable: boolean;
      combinesToType: string | null;
      sleepsExtra: boolean;
      notes: string | null;
    }[];
  }[];
  amenities: { amenity: { code: string } }[];
  photos: Photo[];
}

interface FormState {
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  descriptionAr: string;
  descriptionEn: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm: string;
  hasKitchen: boolean;
  hasBalcony: boolean;
  smokingAllowed: boolean;
  view: string;
  bookingRoomId: string;
  channelSync: boolean;
  isActive: boolean;
  sortOrder: number;
  rooms: RoomState[];
  amenityCodes: string[];
}

function emptyForm(): FormState {
  return {
    code: "",
    nameAr: "",
    nameEn: "",
    category: "apartment",
    descriptionAr: "",
    descriptionEn: "",
    maxAdults: 2,
    maxChildren: 0,
    maxOccupancy: 2,
    sizeSqm: "",
    hasKitchen: false,
    hasBalcony: false,
    smokingAllowed: false,
    view: "",
    bookingRoomId: "",
    channelSync: false,
    isActive: true,
    sortOrder: 0,
    rooms: [emptyRoom(0)],
    amenityCodes: [],
  };
}

interface Props {
  id: number | null;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "basic" | "rooms" | "amenities" | "photos" | "booking";

export function UnitTypeFormModal({ id, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("basic");
  const [uploading, setUploading] = useState(false);
  const isEdit = id != null;

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  useEffect(() => {
    async function load() {
      try {
        const amenitiesRes = await fetch("/api/amenities");
        if (amenitiesRes.ok) {
          setAmenities(await amenitiesRes.json());
        }

        if (id != null) {
          const res = await fetch(`/api/unit-types/${id}`);
          if (!res.ok) throw new Error("فشل تحميل النوع");
          const data = (await res.json()) as UnitTypeDetail;
          setForm({
            code: data.code,
            nameAr: data.nameAr,
            nameEn: data.nameEn,
            category: data.category,
            descriptionAr: data.descriptionAr ?? "",
            descriptionEn: data.descriptionEn ?? "",
            maxAdults: data.maxAdults,
            maxChildren: data.maxChildren,
            maxOccupancy: data.maxOccupancy,
            sizeSqm: data.sizeSqm?.toString() ?? "",
            hasKitchen: data.hasKitchen,
            hasBalcony: data.hasBalcony,
            smokingAllowed: data.smokingAllowed,
            view: data.view ?? "",
            bookingRoomId: data.bookingRoomId ?? "",
            channelSync: data.channelSync,
            isActive: data.isActive,
            sortOrder: data.sortOrder,
            rooms: data.rooms.map((r, idx) => ({
              nameAr: r.nameAr,
              nameEn: r.nameEn,
              kind: r.kind,
              position: r.position ?? idx,
              beds: r.beds.map((b) => ({
                bedType: b.bedType,
                count: b.count,
                combinable: b.combinable,
                combinesToType: b.combinesToType,
                sleepsExtra: b.sleepsExtra,
                notes: b.notes,
              })),
            })),
            amenityCodes: data.amenities.map((a) => a.amenity.code),
          });
          setPhotos(data.photos);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "خطأ");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        category: form.category,
        descriptionAr: form.descriptionAr || null,
        descriptionEn: form.descriptionEn || null,
        maxAdults: Number(form.maxAdults),
        maxChildren: Number(form.maxChildren),
        maxOccupancy: Number(form.maxOccupancy),
        sizeSqm: form.sizeSqm ? Number(form.sizeSqm) : null,
        hasKitchen: form.hasKitchen,
        hasBalcony: form.hasBalcony,
        smokingAllowed: form.smokingAllowed,
        view: form.view || null,
        bookingRoomId: form.bookingRoomId || null,
        channelSync: form.channelSync,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder),
        rooms: form.rooms,
        amenityCodes: form.amenityCodes,
      };

      const res = isEdit
        ? await fetch(`/api/unit-types/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/unit-types", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "فشل الحفظ");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoUpload(file: File) {
    if (id == null) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/unit-types/${id}/photos`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "فشل رفع الصورة");
      }
      const p = await fetch(`/api/unit-types/${id}/photos`);
      if (p.ok) setPhotos(await p.json());
    } catch (e) {
      alert(e instanceof Error ? e.message : "فشل رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  async function handleSetPrimary(photoId: number) {
    if (id == null) return;
    const res = await fetch(`/api/unit-types/${id}/photos/${photoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimary: true }),
    });
    if (res.ok) {
      const p = await fetch(`/api/unit-types/${id}/photos`);
      if (p.ok) setPhotos(await p.json());
    }
  }

  async function handleDeletePhoto(photoId: number) {
    if (id == null) return;
    if (!confirm("حذف هذه الصورة؟")) return;
    const res = await fetch(`/api/unit-types/${id}/photos/${photoId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setPhotos(photos.filter((p) => p.id !== photoId));
    }
  }

  const tabs: { key: Tab; label: string; disabled?: boolean }[] = [
    { key: "basic", label: "المعلومات الأساسية" },
    { key: "rooms", label: "الغرف والأسرّة" },
    { key: "amenities", label: "المرافق" },
    { key: "photos", label: "الصور", disabled: !isEdit },
    { key: "booking", label: "Booking.com" },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-800">
            {isEdit ? `تعديل النوع: ${form.nameAr || form.code}` : "نوع وحدة جديد"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex border-b border-gray-100 bg-white px-4 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => !t.disabled && setTab(t.key)}
              disabled={t.disabled}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                tab === t.key
                  ? "border-primary text-primary"
                  : t.disabled
                    ? "border-transparent text-gray-300 cursor-not-allowed"
                    : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {t.label}
              {t.disabled && " (احفظ أولًا)"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
                  <AlertCircle size={16} /> {err}
                </div>
              )}

              {tab === "basic" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        رمز النوع *
                      </label>
                      <input
                        type="text"
                        required
                        disabled={isEdit}
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                        placeholder="APT-1BR-DBL"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-50 disabled:text-gray-500 direction-ltr text-right"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        الاسم (عربي) *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.nameAr}
                        onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name (EN) *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.nameEn}
                        onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary direction-ltr text-right"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        الفئة *
                      </label>
                      <select
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        {UNIT_CATEGORIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.labelAr}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        بالغون
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={form.maxAdults}
                        onChange={(e) =>
                          setForm({ ...form, maxAdults: Number(e.target.value) || 1 })
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        أطفال
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={form.maxChildren}
                        onChange={(e) =>
                          setForm({ ...form, maxChildren: Number(e.target.value) || 0 })
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        السعة القصوى
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={form.maxOccupancy}
                        onChange={(e) =>
                          setForm({ ...form, maxOccupancy: Number(e.target.value) || 1 })
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        المساحة (م²)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={form.sizeSqm}
                        onChange={(e) => setForm({ ...form, sizeSqm: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      الوصف (عربي)
                    </label>
                    <textarea
                      value={form.descriptionAr}
                      onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description (EN)
                    </label>
                    <textarea
                      value={form.descriptionEn}
                      onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y direction-ltr text-right"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50/50 rounded-lg p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.hasKitchen}
                        onChange={(e) => setForm({ ...form, hasKitchen: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      مطبخ
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.hasBalcony}
                        onChange={(e) => setForm({ ...form, hasBalcony: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      شرفة
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.smokingAllowed}
                        onChange={(e) => setForm({ ...form, smokingAllowed: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      تدخين مسموح
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      مُفعَّل
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        الإطلالة
                      </label>
                      <input
                        type="text"
                        value={form.view}
                        onChange={(e) => setForm({ ...form, view: e.target.value })}
                        placeholder="مثال: إطلالة على الحديقة"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ترتيب العرض
                      </label>
                      <input
                        type="number"
                        value={form.sortOrder}
                        onChange={(e) =>
                          setForm({ ...form, sortOrder: Number(e.target.value) || 0 })
                        }
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              {tab === "rooms" && (
                <BedConfigurator
                  rooms={form.rooms}
                  onChange={(rooms) => setForm({ ...form, rooms })}
                />
              )}

              {tab === "amenities" && (
                amenities.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8">
                    لا توجد مرافق معرَّفة بعد. شغّل <code>npm run db:seed-unit-types</code>.
                  </div>
                ) : (
                  <AmenitiesPicker
                    amenities={amenities}
                    selectedCodes={form.amenityCodes}
                    onChange={(codes) => setForm({ ...form, amenityCodes: codes })}
                  />
                )
              )}

              {tab === "photos" && isEdit && (
                <div className="space-y-4">
                  <label className="flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-primary hover:bg-gold-soft cursor-pointer transition-colors">
                    <Upload size={24} className="text-primary-light" />
                    <span className="text-sm text-gray-600">
                      {uploading ? "جارٍ الرفع..." : "انقر لرفع صورة"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePhotoUpload(f);
                      }}
                    />
                  </label>

                  {photos.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      لا توجد صور بعد
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {photos.map((p) => (
                        <div
                          key={p.id}
                          className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden group"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              p.url.startsWith("stored:")
                                ? `/api/unit-types/${id}/photos/${p.id}`
                                : p.url
                            }
                            alt={p.captionAr ?? ""}
                            className="w-full h-full object-cover"
                          />
                          {p.isPrimary && (
                            <span className="absolute top-2 right-2 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Star size={10} /> رئيسية
                            </span>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            {!p.isPrimary && (
                              <button
                                type="button"
                                onClick={() => handleSetPrimary(p.id)}
                                className="p-1.5 bg-white/90 hover:bg-white rounded"
                                title="تعيين رئيسية"
                              >
                                <Star size={14} className="text-primary" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeletePhoto(p.id)}
                              className="p-1.5 bg-white/90 hover:bg-white rounded"
                              title="حذف"
                            >
                              <Trash2 size={14} className="text-danger" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "booking" && (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 rounded-lg p-3 text-sm">
                    هذه الإعدادات تربط نوع الوحدة مع معرّف الغرفة في Booking.com Extranet
                    (ستُستخدم من قِبَل الـ Bot).
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Booking Room ID
                    </label>
                    <input
                      type="text"
                      value={form.bookingRoomId}
                      onChange={(e) => setForm({ ...form, bookingRoomId: e.target.value })}
                      placeholder="مثال: 12345678"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary direction-ltr text-right"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.channelSync}
                      onChange={(e) => setForm({ ...form, channelSync: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                    تفعيل المزامنة التلقائية مع Booking.com
                  </label>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {saving ? "جارٍ الحفظ..." : isEdit ? "حفظ التغييرات" : "إنشاء"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
