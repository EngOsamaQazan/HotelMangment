"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Tag,
  Plus,
  Loader2,
  Save,
  Calendar,
  Trash2,
  BedDouble,
  CheckCircle2,
  AlertCircle,
  Power,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";
import { usePermissions } from "@/lib/permissions/client";

interface UnitTypeLite {
  id: number;
  code: string;
  nameAr: string;
  category: string;
  sortOrder: number;
  isActive?: boolean;
}

interface PriceRow {
  id: number;
  unitTypeId: number;
  seasonId: number;
  daily: number;
  weekly: number;
  monthly: number;
  unitType: UnitTypeLite;
}

interface SeasonWithPrices {
  id: number;
  nameAr: string;
  nameEn: string | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  sortOrder: number;
  prices: PriceRow[];
}

type Draft = Record<number, { daily?: string; weekly?: string; monthly?: string }>;

const categoryLabels: Record<string, string> = {
  apartment: "شقة",
  hotel_room: "غرفة فندقية",
  suite: "جناح",
  studio: "استوديو",
};

export default function PricesPage() {
  const [seasons, setSeasons] = useState<SeasonWithPrices[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const { can } = usePermissions();
  const canEditPrices = can("settings.prices:edit");
  const [newForm, setNewForm] = useState({
    nameAr: "",
    nameEn: "",
    startDate: "",
    endDate: "",
  });
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/seasons");
      if (!res.ok) throw new Error("فشل تحميل المواسم");
      const data: SeasonWithPrices[] = await res.json();
      setSeasons(data);
      if (data.length > 0 && activeId === null) setActiveId(data[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(
    () => seasons.find((s) => s.id === activeId) || null,
    [seasons, activeId],
  );

  const sortedPrices = useMemo(() => {
    if (!active) return [] as PriceRow[];
    return [...active.prices].sort((a, b) => {
      if (a.unitType.category !== b.unitType.category)
        return a.unitType.category.localeCompare(b.unitType.category);
      return (a.unitType.sortOrder ?? 0) - (b.unitType.sortOrder ?? 0);
    });
  }, [active]);

  function handleDraft(rowId: number, field: "daily" | "weekly" | "monthly", value: string) {
    setDraft((d) => ({ ...d, [rowId]: { ...d[rowId], [field]: value } }));
  }

  const dirtyCount = Object.keys(draft).length;

  async function handleSaveAll() {
    if (!active || dirtyCount === 0) return;
    setSaving(true);
    try {
      const rows = Object.entries(draft).map(([rowIdStr, edits]) => {
        const rowId = Number(rowIdStr);
        const row = active.prices.find((p) => p.id === rowId)!;
        return {
          unitTypeId: row.unitTypeId,
          seasonId: row.seasonId,
          daily: edits.daily !== undefined ? Number(edits.daily) : row.daily,
          weekly: edits.weekly !== undefined ? Number(edits.weekly) : row.weekly,
          monthly: edits.monthly !== undefined ? Number(edits.monthly) : row.monthly,
        };
      });
      const res = await fetch("/api/unit-type-prices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "فشل الحفظ");
      }
      toast.success(`تم حفظ ${rows.length} سعر`);
      setDraft({});
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateSeason(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.nameAr.trim() || !newForm.startDate || !newForm.endDate) return;
    setCreating(true);
    try {
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "فشل إنشاء الموسم");
      }
      const created = await res.json();
      toast.success("تم إنشاء الموسم");
      setShowNew(false);
      setNewForm({ nameAr: "", nameEn: "", startDate: "", endDate: "" });
      await load();
      setActiveId(created.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإنشاء");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteSeason(id: number) {
    if (!confirm("هل أنت متأكد من حذف الموسم؟ سيتم حذف جميع أسعار الأنواع المرتبطة به.")) return;
    try {
      const res = await fetch(`/api/seasons/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("فشل الحذف");
      toast.success("تم حذف الموسم");
      if (activeId === id) setActiveId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    }
  }

  async function handleToggleActive(s: SeasonWithPrices) {
    try {
      await fetch(`/api/seasons/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !s.isActive }),
      });
      await load();
    } catch {
      toast.error("فشل تغيير الحالة");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary transition-colors mb-2"
          >
            <ArrowLeft size={14} />
            العودة للإعدادات
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Tag className="text-primary" />
            الأسعار الموسمية حسب نوع الوحدة
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            حدّد لكل موسم سعرًا يوميًّا/أسبوعيًّا/شهريًّا لكل نوع وحدة.
          </p>
        </div>
        <Can permission="settings.prices:create">
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            موسم جديد
          </button>
        </Can>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      ) : seasons.length === 0 ? (
        <div className="bg-card-bg rounded-xl py-20 flex flex-col items-center gap-3 text-gray-400">
          <Tag size={48} className="opacity-50" />
          <p>لا توجد مواسم بعد. أضِف موسمًا لبدء التسعير.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          <aside className="space-y-2">
            {seasons.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "rounded-lg border transition-all group",
                  activeId === s.id
                    ? "border-primary bg-gold-soft/40"
                    : "border-gray-200 bg-card-bg hover:border-primary/30",
                )}
              >
                <button
                  onClick={() => setActiveId(s.id)}
                  className="w-full text-right px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-800 truncate">
                      {s.nameAr}
                    </span>
                    {!s.isActive && (
                      <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        متوقف
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <Calendar size={11} />
                    <span>
                      {s.startDate.split("T")[0]} → {s.endDate.split("T")[0]}
                    </span>
                  </div>
                </button>
                <div className="flex items-center justify-between px-3 pb-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Can permission="settings.prices:edit">
                    <button
                      onClick={() => handleToggleActive(s)}
                      className="text-xs text-gray-500 hover:text-primary flex items-center gap-1"
                      title={s.isActive ? "تعطيل" : "تفعيل"}
                    >
                      <Power size={12} />
                      {s.isActive ? "تعطيل" : "تفعيل"}
                    </button>
                  </Can>
                  <Can permission="settings.prices:delete">
                    <button
                      onClick={() => handleDeleteSeason(s.id)}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      حذف
                    </button>
                  </Can>
                </div>
              </div>
            ))}
          </aside>

          <div className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
            {!active ? (
              <div className="py-20 flex flex-col items-center gap-3 text-gray-400">
                <AlertCircle size={36} />
                <p>اختر موسمًا من القائمة</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div>
                    <h2 className="font-bold text-gray-800">{active.nameAr}</h2>
                    <p className="text-xs text-gray-500">
                      {active.startDate.split("T")[0]} → {active.endDate.split("T")[0]}
                    </p>
                  </div>
                  <Can permission="settings.prices:edit">
                    <button
                      onClick={handleSaveAll}
                      disabled={saving || dirtyCount === 0}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        dirtyCount > 0
                          ? "bg-success text-white hover:bg-green-700"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed",
                      )}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {dirtyCount > 0 ? `حفظ (${dirtyCount})` : "لا تغييرات"}
                    </button>
                  </Can>
                </div>

                {sortedPrices.length === 0 ? (
                  <div className="py-16 flex flex-col items-center gap-3 text-gray-400">
                    <BedDouble size={36} />
                    <p>لا توجد أنواع وحدات نشطة.</p>
                    <Link
                      href="/settings/unit-types"
                      className="text-sm text-primary hover:underline"
                    >
                      أضف نوع وحدة
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-xs">
                          <th className="text-right px-3 py-2 font-medium">نوع الوحدة</th>
                          <th className="text-center px-3 py-2 font-medium">الفئة</th>
                          <th className="text-center px-3 py-2 font-medium">يومي</th>
                          <th className="text-center px-3 py-2 font-medium">أسبوعي</th>
                          <th className="text-center px-3 py-2 font-medium">شهري</th>
                          <th className="text-center px-3 py-2 font-medium w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sortedPrices.map((row) => {
                          const edits = draft[row.id] || {};
                          const hasEdits = Object.keys(edits).length > 0;
                          return (
                            <tr
                              key={row.id}
                              className={cn(
                                "transition-colors",
                                hasEdits ? "bg-yellow-50/60" : "hover:bg-gray-50/60",
                              )}
                            >
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-800">
                                  {row.unitType.nameAr}
                                </div>
                                <div className="text-[10px] text-gray-400 font-mono">
                                  {row.unitType.code}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className="text-xs text-gray-500">
                                  {categoryLabels[row.unitType.category] ?? row.unitType.category}
                                </span>
                              </td>
                              {(["daily", "weekly", "monthly"] as const).map((f) => (
                                <td key={f} className="px-2 py-2 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={edits[f] ?? row[f]}
                                    onChange={(e) => handleDraft(row.id, f, e.target.value)}
                                    disabled={!canEditPrices}
                                    readOnly={!canEditPrices}
                                    className="w-24 border border-transparent hover:border-gray-200 focus:border-primary rounded px-2 py-1 text-sm text-center text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-2 text-center">
                                {hasEdits && (
                                  <CheckCircle2 size={14} className="text-yellow-500 inline" />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-md max-h-[95vh] flex flex-col">
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-800">موسم جديد</h3>
              <button
                onClick={() => setShowNew(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSeason} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  اسم الموسم (عربي)
                </label>
                <input
                  type="text"
                  required
                  value={newForm.nameAr}
                  onChange={(e) => setNewForm({ ...newForm, nameAr: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="مثال: الموسم الصيفي"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  الاسم بالإنجليزي (اختياري)
                </label>
                <input
                  type="text"
                  value={newForm.nameEn}
                  onChange={(e) => setNewForm({ ...newForm, nameEn: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  placeholder="Summer Season"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">من</label>
                  <input
                    type="date"
                    required
                    value={newForm.startDate}
                    onChange={(e) => setNewForm({ ...newForm, startDate: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">إلى</label>
                  <input
                    type="date"
                    required
                    value={newForm.endDate}
                    onChange={(e) => setNewForm({ ...newForm, endDate: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2"
                >
                  {creating && <Loader2 size={14} className="animate-spin" />}
                  إنشاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
