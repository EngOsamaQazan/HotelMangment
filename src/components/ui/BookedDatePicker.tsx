"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { arSA } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface BlockedRange {
  id: number | string;
  guestName?: string;
  status?: string;
  checkIn: string; // ISO
  checkOut: string; // ISO (exclusive)
}

export interface BookedDatePickerProps {
  /** Controlled value in `yyyy-MM-dd` form. Empty string means unset. */
  value: string;
  onChange: (next: string) => void;
  /** Ranges that cannot be selected. `checkIn` is inclusive, `checkOut` exclusive. */
  blockedRanges?: BlockedRange[];
  /** Disable any date before this value (default: today). */
  minDate?: Date;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** If true, the unit is under maintenance -> disable everything. */
  maintenance?: boolean;
  /** Optional label for an all-day maintenance banner inside the popover. */
  unavailableReason?: string;
}

const WEEKDAY_HEADERS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function toStartOfDay(iso: string): Date {
  return startOfDay(parseISO(iso));
}

function dateInRange(day: Date, range: BlockedRange): boolean {
  const start = startOfDay(parseISO(range.checkIn));
  const end = startOfDay(parseISO(range.checkOut));
  // checkOut is exclusive (guest leaves that morning)
  return day.getTime() >= start.getTime() && day.getTime() < end.getTime();
}

export function BookedDatePicker({
  value,
  onChange,
  blockedRanges = [],
  minDate,
  placeholder = "اختر التاريخ",
  className,
  disabled = false,
  id,
  maintenance = false,
  unavailableReason,
}: BookedDatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedDate = useMemo(() => (value ? parseISO(value) : null), [value]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const effectiveMin = useMemo(
    () => (minDate ? startOfDay(minDate) : today),
    [minDate, today],
  );

  // `monthOverride` is the month the user has paged to via prev/next.
  // When the controlled `value` changes we clear the override so the
  // calendar follows the new selection. This is the canonical
  // "sync state with props during render" pattern (no useEffect needed).
  const [monthOverride, setMonthOverride] = useState<Date | null>(null);
  const [lastSeenValue, setLastSeenValue] = useState(value);
  if (value !== lastSeenValue) {
    setLastSeenValue(value);
    setMonthOverride(null);
  }
  const viewMonth: Date = monthOverride ?? selectedDate ?? effectiveMin ?? today;
  const setViewMonth = (d: Date) => setMonthOverride(d);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

  const blockedIntervals = useMemo(
    () =>
      blockedRanges.map((r) => ({
        range: r,
        start: toStartOfDay(r.checkIn),
        end: toStartOfDay(r.checkOut),
      })),
    [blockedRanges],
  );

  function isBlocked(day: Date): BlockedRange | null {
    for (const { range, start, end } of blockedIntervals) {
      if (day.getTime() >= start.getTime() && day.getTime() < end.getTime()) {
        return range;
      }
    }
    return null;
  }

  function handleSelect(day: Date) {
    if (maintenance) return;
    if (day.getTime() < effectiveMin.getTime()) return;
    if (isBlocked(day)) return;
    onChange(format(day, "yyyy-MM-dd"));
    setOpen(false);
  }

  const triggerLabel = selectedDate
    ? format(selectedDate, "EEEE، d MMMM yyyy", { locale: arSA })
    : placeholder;

  return (
    <div ref={containerRef} className={cn("relative", className)} dir="rtl">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-4 py-2.5 border border-gray-200 rounded-lg bg-white",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm text-right",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        <span className={cn("truncate", !selectedDate && "text-gray-400")}>{triggerLabel}</span>
        <CalendarDays className="w-4 h-4 text-gray-500 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 w-80 max-w-[95vw] bg-white border border-gray-200 rounded-xl shadow-lg p-3 right-0"
          role="dialog"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="p-1.5 rounded hover:bg-gray-100"
              aria-label="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="text-sm font-semibold text-gray-700">
              {format(viewMonth, "MMMM yyyy", { locale: arSA })}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="p-1.5 rounded hover:bg-gray-100"
              aria-label="الشهر التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {maintenance && (
            <div className="mb-2 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs text-center">
              {unavailableReason ?? "الوحدة تحت الصيانة — لا يمكن الحجز حالياً"}
            </div>
          )}

          <div className="grid grid-cols-7 gap-1 text-[11px] text-gray-500 mb-1">
            {WEEKDAY_HEADERS.map((d) => (
              <div key={d} className="text-center py-1">{d.slice(0, 3)}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const inMonth = isSameMonth(day, viewMonth);
              const beforeMin = day.getTime() < effectiveMin.getTime();
              const blocked = isBlocked(day);
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const isToday = isSameDay(day, today);
              const disabledDay = maintenance || beforeMin || !!blocked;

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabledDay}
                  title={
                    blocked
                      ? `محجوز${blocked.guestName ? ` لصالح ${blocked.guestName}` : ""}`
                      : beforeMin
                      ? "تاريخ قديم"
                      : maintenance
                      ? "الوحدة تحت الصيانة"
                      : undefined
                  }
                  onClick={() => handleSelect(day)}
                  className={cn(
                    "aspect-square text-xs rounded-md flex items-center justify-center relative transition-colors",
                    !inMonth && "text-gray-300",
                    inMonth && !disabledDay && !isSelected && "hover:bg-primary/10 text-gray-700",
                    disabledDay && "cursor-not-allowed",
                    blocked && "bg-red-50 text-red-400 line-through decoration-red-300",
                    beforeMin && !blocked && "text-gray-300",
                    isSelected && "bg-primary text-white font-semibold hover:bg-primary",
                    !isSelected && isToday && "ring-1 ring-primary/40",
                  )}
                >
                  {format(day, "d", { locale: arSA })}
                </button>
              );
            })}
          </div>

          {blockedRanges.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                <span className="inline-block w-3 h-3 rounded-sm bg-red-50 border border-red-200" />
                أيام محجوزة مسبقاً
              </div>
              <div className="space-y-1 max-h-28 overflow-auto">
                {blockedRanges.slice(0, 6).map((r) => (
                  <div
                    key={r.id}
                    className="text-[11px] text-gray-600 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      {r.guestName || `حجز #${r.id}`}
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {format(parseISO(r.checkIn), "d MMM", { locale: arSA })} → {" "}
                      {format(parseISO(r.checkOut), "d MMM", { locale: arSA })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Given a start date and a duration, tell the caller whether the resulting
 * span overlaps any blocked range. Used by forms that add nights to the
 * picked start date (so the user sees an error before submission).
 */
export function isSpanBlocked(
  startISO: string,
  endISO: string,
  blockedRanges: BlockedRange[],
): BlockedRange | null {
  if (!startISO || !endISO) return null;
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  for (const r of blockedRanges) {
    const rStart = parseISO(r.checkIn);
    const rEnd = parseISO(r.checkOut);
    // Overlap iff (start < rEnd) && (end > rStart). Excludes touching boundaries.
    if (start.getTime() < rEnd.getTime() && end.getTime() > rStart.getTime()) {
      return r;
    }
  }
  return null;
}

// Re-export a small helper so callers don't need date-fns imports.
export { isWithinInterval, dateInRange };
