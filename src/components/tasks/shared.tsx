"use client";

import type { TaskPriority } from "@/lib/collab/types";
import { cn } from "@/lib/utils";

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  low: {
    label: "منخفضة",
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-200",
    dot: "bg-gray-400",
  },
  med: {
    label: "متوسطة",
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  high: {
    label: "مرتفعة",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  urgent: {
    label: "عاجلة",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
  },
};

export function PriorityBadge({
  priority,
  size = "sm",
}: {
  priority: TaskPriority;
  size?: "xs" | "sm";
}) {
  const m = PRIORITY_META[priority] ?? PRIORITY_META.med;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium border",
        m.bg,
        m.text,
        m.border,
        size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] || "").join("").toUpperCase();
}

export function avatarColor(id: number): string {
  const palette = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-orange-500",
    "bg-purple-500",
  ];
  return palette[id % palette.length];
}

export function UserAvatar({
  user,
  size = 24,
  className,
}: {
  user: { id: number; name: string; avatarUrl?: string | null };
  size?: number;
  className?: string;
}) {
  const hasPhoto = Boolean(user.avatarUrl);
  return (
    <span
      title={user.name}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-bold overflow-hidden shrink-0",
        !hasPhoto && avatarColor(user.id),
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.floor(size / 2.3)),
      }}
    >
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/files/avatar/${user.id}`}
          alt={user.name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initialsOf(user.name) || "?"}</span>
      )}
    </span>
  );
}

/**
 * Format a date to Arabic short form (e.g. "22 آذار").
 * Returns "—" if date is null/invalid.
 */
export function formatShortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "short",
  });
}

/** Returns true if date is strictly in the past (and not null). */
export function isOverdue(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value);
  return d.getTime() < Date.now();
}
