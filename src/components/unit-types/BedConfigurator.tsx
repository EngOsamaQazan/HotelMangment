"use client";

import { Plus, Trash2, GripVertical, Info } from "lucide-react";
import { NumberInput } from "@/components/ui/NumberInput";
import { BED_TYPES, ROOM_KINDS, BedIcon } from "./shared";

export interface BedState {
  bedType: string;
  count: number;
  /**
   * Marks this bed as the single rollaway / extra bed for the room.
   * Only ONE bed per room may carry this flag (enforced in the UI and at
   * the API layer). Physical-room merging happens at the `Unit` level via
   * `UnitMerge` — it is NOT a bed-level concern.
   */
  sleepsExtra: boolean;
  notes: string | null;
}

export interface RoomState {
  nameAr: string;
  nameEn: string;
  kind: string;
  position: number;
  beds: BedState[];
}

export function emptyBed(): BedState {
  return {
    bedType: "single",
    count: 1,
    sleepsExtra: false,
    notes: null,
  };
}

export function emptyRoom(position: number): RoomState {
  return {
    nameAr: "غرفة النوم",
    nameEn: "Bedroom",
    kind: "bedroom",
    position,
    beds: [emptyBed()],
  };
}

interface Props {
  rooms: RoomState[];
  onChange: (rooms: RoomState[]) => void;
}

export function BedConfigurator({ rooms, onChange }: Props) {
  function updateRoom(idx: number, patch: Partial<RoomState>) {
    const next = rooms.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  }

  function updateBed(roomIdx: number, bedIdx: number, patch: Partial<BedState>) {
    const next = rooms.map((r, i) => {
      if (i !== roomIdx) return r;
      // Enforce "at most one extra bed per room". If the edit turns
      // sleepsExtra on, clear the flag on every sibling bed first.
      const turningExtraOn = patch.sleepsExtra === true;
      const beds = r.beds.map((b, j) => {
        if (j === bedIdx) return { ...b, ...patch };
        if (turningExtraOn) return { ...b, sleepsExtra: false };
        return b;
      });
      return { ...r, beds };
    });
    onChange(next);
  }

  function addRoom() {
    onChange([...rooms, emptyRoom(rooms.length)]);
  }

  function removeRoom(idx: number) {
    onChange(rooms.filter((_, i) => i !== idx).map((r, i) => ({ ...r, position: i })));
  }

  function addBed(roomIdx: number) {
    const next = rooms.map((r, i) =>
      i === roomIdx ? { ...r, beds: [...r.beds, emptyBed()] } : r,
    );
    onChange(next);
  }

  function removeBed(roomIdx: number, bedIdx: number) {
    const next = rooms.map((r, i) =>
      i === roomIdx ? { ...r, beds: r.beds.filter((_, j) => j !== bedIdx) } : r,
    );
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-gold-soft/30 border border-gold/30 text-[11px] text-primary/80">
        <Info size={14} className="shrink-0 mt-0.5 text-primary" />
        <div className="leading-relaxed">
          <strong className="text-primary">تلميح:</strong> عرِّف هنا غرف هذا
          النوع وأسِرَّتها فقط. الدمج بين غرفتين ماديّتين (عبر الباب الجانبي)
          يُدار من شاشة «الغرف» أو «إعدادات &rsaquo; دمج الوحدات» كعلاقة بين
          الوحدات الماديّة (Units)، لا على مستوى السرير.
        </div>
      </div>
      {rooms.map((room, rIdx) => (
        <div
          key={rIdx}
          className="border border-gray-200 rounded-xl p-4 bg-gray-50/40 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-gray-400">
              <GripVertical size={16} />
              <span className="text-xs font-semibold text-gray-500">
                غرفة {rIdx + 1}
              </span>
            </div>
            <button
              type="button"
              onClick={() => removeRoom(rIdx)}
              className="text-red-400 hover:text-danger p-1 rounded"
              title="حذف الغرفة"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                الاسم (عربي)
              </label>
              <input
                type="text"
                value={room.nameAr}
                onChange={(e) => updateRoom(rIdx, { nameAr: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name (EN)
              </label>
              <input
                type="text"
                value={room.nameEn}
                onChange={(e) => updateRoom(rIdx, { nameEn: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white direction-ltr text-right"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                النوع
              </label>
              <select
                value={room.kind}
                onChange={(e) => updateRoom(rIdx, { kind: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
              >
                {ROOM_KINDS.map((k) => (
                  <option key={k.code} value={k.code}>
                    {k.labelAr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">الأسرّة</span>
              <button
                type="button"
                onClick={() => addBed(rIdx)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary-dark"
              >
                <Plus size={12} /> إضافة سرير
              </button>
            </div>

            {room.beds.length === 0 ? (
              <div className="text-xs text-gray-400 bg-white rounded-lg border border-dashed border-gray-200 p-3 text-center">
                لا توجد أسرّة في هذه الغرفة
              </div>
            ) : (
              room.beds.map((bed, bIdx) => {
                const extraUsedElsewhere = room.beds.some(
                  (b, j) => j !== bIdx && b.sleepsExtra,
                );
                return (
                  <div
                    key={bIdx}
                    className="bg-white rounded-lg border border-gray-200 p-2.5 space-y-2"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">
                          نوع السرير
                        </label>
                        <div className="relative">
                          <select
                            value={bed.bedType}
                            onChange={(e) =>
                              updateBed(rIdx, bIdx, { bedType: e.target.value })
                            }
                            className="w-full border border-gray-200 rounded-lg pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          >
                            {BED_TYPES.map((b) => (
                              <option key={b.code} value={b.code}>
                                {b.labelAr}
                              </option>
                            ))}
                          </select>
                          <BedIcon
                            bedType={bed.bedType}
                            size={14}
                            className="absolute left-2 top-1/2 -translate-y-1/2 text-primary"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-gray-500 mb-1">
                          العدد
                        </label>
                        <NumberInput
                          min={1}
                          value={bed.count}
                          onValueChange={(n) =>
                            updateBed(rIdx, bIdx, { count: n })
                          }
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      <div className="sm:col-span-2 flex items-center gap-3 pb-1">
                        <label
                          className="flex items-center gap-1.5 text-xs text-gray-600"
                          title={
                            extraUsedElsewhere && !bed.sleepsExtra
                              ? "لا يمكن أن يكون أكثر من سرير إضافي واحد في الغرفة الواحدة — تفعيل هذا الخيار سيُلغي الإضافي السابق تلقائياً."
                              : "سرير نقّال (Rollaway) واحد كحدّ أقصى لكل غرفة."
                          }
                        >
                          <input
                            type="checkbox"
                            checked={bed.sleepsExtra}
                            onChange={(e) =>
                              updateBed(rIdx, bIdx, {
                                sleepsExtra: e.target.checked,
                              })
                            }
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          نوم إضافي
                        </label>
                        <button
                          type="button"
                          onClick={() => removeBed(rIdx, bIdx)}
                          className="ms-auto text-red-400 hover:text-danger p-1 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-medium text-gray-500 mb-1">
                        ملاحظات
                      </label>
                      <input
                        type="text"
                        value={bed.notes ?? ""}
                        onChange={(e) =>
                          updateBed(rIdx, bIdx, {
                            notes: e.target.value || null,
                          })
                        }
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary"
                        placeholder="اختياري"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addRoom}
        className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-primary hover:text-primary hover:bg-gold-soft transition-colors"
      >
        <Plus size={16} /> إضافة غرفة
      </button>
    </div>
  );
}
