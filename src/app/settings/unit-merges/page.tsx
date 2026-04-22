"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DoorOpen,
  Loader2,
  Link2,
  Unlink,
  AlertCircle,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/client";
import { Can } from "@/components/Can";

interface UnitLite {
  id: number;
  unitNumber: string;
  floor: number;
}

interface MergeRow {
  id: number;
  unitA: UnitLite;
  unitB: UnitLite;
  notes: string | null;
  createdAt: string;
}

interface AvailableUnit {
  id: number;
  unitNumber: string;
  floor: number;
  unitTypeName: string | null;
  isMerged: boolean;
}

export default function UnitMergesSettingsPage() {
  const { can } = usePermissions();
  const canEdit = can("rooms:edit");

  const [merges, setMerges] = useState<MergeRow[]>([]);
  const [units, setUnits] = useState<AvailableUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [mergesRes, unitsRes] = await Promise.all([
        fetch("/api/unit-merges", { cache: "no-store" }),
        fetch("/api/units", { cache: "no-store" }),
      ]);
      if (!mergesRes.ok) throw new Error(`HTTP ${mergesRes.status} (unit-merges)`);
      if (!unitsRes.ok) throw new Error(`HTTP ${unitsRes.status} (units)`);
      const mergeData = (await mergesRes.json()) as MergeRow[];
      const unitsRaw = (await unitsRes.json()) as Array<{
        id: number;
        unitNumber: string;
        floor: number;
        unitTypeRef: { nameAr: string } | null;
      }>;
      setMerges(mergeData);
      const takenIds = new Set<number>();
      mergeData.forEach((m) => {
        takenIds.add(m.unitA.id);
        takenIds.add(m.unitB.id);
      });
      setUnits(
        unitsRaw.map((u) => ({
          id: u.id,
          unitNumber: u.unitNumber,
          floor: u.floor,
          unitTypeName: u.unitTypeRef?.nameAr ?? null,
          isMerged: takenIds.has(u.id),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل البيانات");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const filteredMerges = useMemo(() => {
    if (!search.trim()) return merges;
    const q = search.trim().toLowerCase();
    return merges.filter(
      (m) =>
        m.unitA.unitNumber.toLowerCase().includes(q) ||
        m.unitB.unitNumber.toLowerCase().includes(q) ||
        (m.notes ?? "").toLowerCase().includes(q),
    );
  }, [merges, search]);

  async function handleDelete(id: number, label: string) {
    if (!confirm(`فكّ ارتباط ${label}؟`)) return;
    try {
      const res = await fetch(`/api/unit-merges/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await refetch();
    } catch (e) {
      alert(e instanceof Error ? e.message : "فشل فكّ الارتباط");
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <DoorOpen className="text-primary" size={24} /> دمج الوحدات
          </h1>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed max-w-2xl">
            إدارة الأزواج الماديّة من الوحدات التي يوجد بينها باب جانبي للدمج.
            يمكن فتح هذا الباب عند الطلب لتحويل الوحدتين إلى شقة عائليّة موحّدة.
            كلّ وحدة يمكن أن تُدمَج مع وحدة واحدة فقط في نفس الطابق.
          </p>
        </div>
        <Can permission="rooms:edit">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="shrink-0 flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium"
          >
            <Plus size={16} /> إضافة زوج جديد
          </button>
        </Can>
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-4 relative">
        <Search
          size={15}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث برقم الوحدة أو الملاحظة…"
          className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
          <Loader2 className="animate-spin" size={18} /> جارٍ التحميل…
        </div>
      ) : filteredMerges.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl py-10 text-center">
          <DoorOpen size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">
            {merges.length === 0
              ? "لم يُسجَّل أي دمج بعد."
              : "لا نتائج مطابقة للبحث."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-right px-4 py-2.5 font-semibold">الوحدة الأولى</th>
                <th className="text-center px-2 py-2.5 w-8"></th>
                <th className="text-right px-4 py-2.5 font-semibold">الوحدة الثانية</th>
                <th className="text-right px-4 py-2.5 font-semibold">الطابق</th>
                <th className="text-right px-4 py-2.5 font-semibold">ملاحظات</th>
                <th className="text-right px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {filteredMerges.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-gray-100 hover:bg-gray-50/60"
                >
                  <td className="px-4 py-2.5 font-semibold text-primary">
                    {m.unitA.unitNumber}
                  </td>
                  <td className="text-center text-gray-400">
                    <Link2 size={14} className="inline" />
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-primary">
                    {m.unitB.unitNumber}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{m.unitA.floor}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate">
                    {m.notes ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(
                            m.id,
                            `${m.unitA.unitNumber} ↔ ${m.unitB.unitNumber}`,
                          )
                        }
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                      >
                        <Unlink size={12} /> فكّ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && canEdit && (
        <CreateMergeModal
          units={units}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refetch();
          }}
        />
      )}
    </div>
  );
}

function CreateMergeModal({
  units,
  onClose,
  onCreated,
}: {
  units: AvailableUnit[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [unitA, setUnitA] = useState<string>("");
  const [unitB, setUnitB] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = units.filter((u) => !u.isMerged);
  const selA = available.find((u) => String(u.id) === unitA);
  const selB = available.find((u) => String(u.id) === unitB);

  const sameFloor = selA && selB && selA.floor === selB.floor;
  const differentIds = selA && selB && selA.id !== selB.id;
  const canSubmit = selA && selB && sameFloor && differentIds;

  // Filter unitB options to same floor as unitA, if selected.
  const unitBOptions = selA
    ? available.filter((u) => u.id !== selA.id && u.floor === selA.floor)
    : available;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/unit-merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: Number(unitA),
          otherUnitId: Number(unitB),
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Link2 size={18} className="text-primary" />
            زوج دمج جديد
          </h3>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          كلا الوحدتين يجب أن تكونا في نفس الطابق وغير مرتبطتين بدمج آخر.
        </p>
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              الوحدة الأولى
            </label>
            <select
              value={unitA}
              onChange={(e) => {
                setUnitA(e.target.value);
                setUnitB("");
              }}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
              required
            >
              <option value="">— اختر —</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNumber} · طابق {u.floor}
                  {u.unitTypeName ? ` · ${u.unitTypeName}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              الوحدة الثانية
            </label>
            <select
              value={unitB}
              onChange={(e) => setUnitB(e.target.value)}
              disabled={!selA}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white disabled:opacity-60"
              required
            >
              <option value="">— اختر —</option>
              {unitBOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNumber} · طابق {u.floor}
                  {u.unitTypeName ? ` · ${u.unitTypeName}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            ملاحظة (اختياري)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثلاً: باب جانبي شرقي بين الغرفتين"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-medium",
              canSubmit && !submitting
                ? "bg-primary hover:bg-primary-dark"
                : "bg-gray-300 cursor-not-allowed",
            )}
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Link2 size={14} />
            )}
            حفظ الارتباط
          </button>
        </div>
      </form>
    </div>
  );
}
