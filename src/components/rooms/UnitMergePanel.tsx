"use client";

import { useEffect, useState } from "react";
import { DoorOpen, Link2, Unlink, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnitLite {
  id: number;
  unitNumber: string;
  floor: number;
}

interface CurrentMerge {
  id: number;
  unitA: UnitLite;
  unitB: UnitLite;
  notes: string | null;
}

interface Candidate extends UnitLite {
  unitTypeId: number | null;
  unitTypeName: string | null;
}

interface Props {
  unit: { id: number; unitNumber: string; floor: number };
  onUnitUpdate?: () => void;
}

/**
 * Compact panel that manages the room-to-room merge pair for a single Unit.
 *
 * Fetches `/api/units/:id/merge-candidates` lazily when rendered so we avoid
 * paying the cost on the main /rooms grid view. Calling `onUnitUpdate` after
 * a successful mutation lets the parent refresh the unit list so the badge
 * next to the unit card reflects the new state.
 */
export function UnitMergePanel({ unit, onUnitUpdate }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [current, setCurrent] = useState<CurrentMerge | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/units/${unit.id}/merge-candidates`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        candidates: Candidate[];
        currentMerge: CurrentMerge | null;
      };
      setCurrent(json.currentMerge);
      setCandidates(json.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل البيانات");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.id]);

  async function handleLink() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/unit-merges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: unit.id,
          otherUnitId: Number(selected),
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      setSelected("");
      setNotes("");
      await refetch();
      onUnitUpdate?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل إنشاء الارتباط");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlink() {
    if (!current) return;
    if (!confirm(`فكّ ارتباط الدمج بين ${current.unitA.unitNumber} و ${current.unitB.unitNumber}؟`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/unit-merges/${current.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      await refetch();
      onUnitUpdate?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل فكّ الارتباط");
    } finally {
      setSubmitting(false);
    }
  }

  const partner =
    current && (current.unitA.id === unit.id ? current.unitB : current.unitA);

  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      <div className="flex items-center gap-2">
        <DoorOpen size={14} className="text-primary" />
        <p className="text-sm font-medium text-gray-700">الدمج مع غرفة مجاورة</p>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        اختر وحدة في نفس الطابق يوجد بينها وبين هذه الوحدة باب جانبي للدمج.
        كلّ وحدة يمكن أن تُدمَج مع وحدة واحدة فقط.
      </p>

      {error && (
        <div className="flex items-start gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-2.5 py-1.5">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
          <Loader2 size={13} className="animate-spin" /> جارٍ التحميل…
        </div>
      ) : current && partner ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Link2 size={14} className="text-green-700" />
              <span className="text-gray-700">
                مدمجة مع{" "}
                <strong className="text-green-800">{partner.unitNumber}</strong>
                <span className="text-[11px] text-gray-500">
                  {" "}
                  (الطابق {partner.floor})
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={submitting}
              className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 disabled:opacity-60"
              title="فكّ الارتباط"
            >
              <Unlink size={12} /> فكّ الارتباط
            </button>
          </div>
          {current.notes && (
            <p className="text-[11px] text-gray-600">
              <span className="text-gray-500">ملاحظة:</span> {current.notes}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.length === 0 ? (
            <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg p-2 text-center">
              لا توجد وحدات مرشّحة في نفس الطابق (غير مرتبطة مسبقاً).
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary bg-white"
                  disabled={submitting}
                >
                  <option value="">— اختر وحدة —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.unitNumber}
                      {c.unitTypeName ? ` · ${c.unitTypeName}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظة (اختياري) — مثلاً: باب جانبي شرقي"
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary"
                  disabled={submitting}
                />
              </div>
              <button
                type="button"
                onClick={handleLink}
                disabled={!selected || submitting}
                className={cn(
                  "w-full flex items-center justify-center gap-2 text-xs font-medium py-1.5 rounded-lg border transition-colors",
                  selected && !submitting
                    ? "bg-primary text-white border-primary hover:bg-primary-dark"
                    : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed",
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 size={12} className="animate-spin" /> جارٍ الحفظ…
                  </>
                ) : (
                  <>
                    <Link2 size={12} /> ربط الوحدتين
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
