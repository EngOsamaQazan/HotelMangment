import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toWesternNumerals(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString());
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatAmount(amount: number | string | null): string {
  if (amount === null || amount === undefined) return "0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return formatted;
}

export function numberToArabicWords(num: number): string {
  const ones = [
    "",
    "واحد",
    "اثنان",
    "ثلاثة",
    "أربعة",
    "خمسة",
    "ستة",
    "سبعة",
    "ثمانية",
    "تسعة",
  ];
  const tens = [
    "",
    "عشرة",
    "عشرون",
    "ثلاثون",
    "أربعون",
    "خمسون",
    "ستون",
    "سبعون",
    "ثمانون",
    "تسعون",
  ];
  const hundreds = [
    "",
    "مائة",
    "مئتان",
    "ثلاثمائة",
    "أربعمائة",
    "خمسمائة",
    "ستمائة",
    "سبعمائة",
    "ثمانمائة",
    "تسعمائة",
  ];
  const thousands = [
    "",
    "ألف",
    "ألفان",
    "ثلاثة آلاف",
    "أربعة آلاف",
    "خمسة آلاف",
    "ستة آلاف",
    "سبعة آلاف",
    "ثمانية آلاف",
    "تسعة آلاف",
  ];

  num = Math.floor(num);
  if (num === 0) return "صفر";

  const parts: string[] = [];
  if (num >= 1000) {
    const t = Math.floor(num / 1000);
    if (t < 10) parts.push(thousands[t]);
    num %= 1000;
  }
  if (num >= 100) {
    parts.push(hundreds[Math.floor(num / 100)]);
    num %= 100;
  }
  if (num >= 20) {
    const t = Math.floor(num / 10);
    const o = num % 10;
    parts.push(o ? `${ones[o]} و${tens[t]}` : tens[t]);
  } else if (num >= 10) {
    const special: Record<number, string> = {
      10: "عشرة",
      11: "أحد عشر",
      12: "اثنا عشر",
      13: "ثلاثة عشر",
      14: "أربعة عشر",
      15: "خمسة عشر",
      16: "ستة عشر",
      17: "سبعة عشر",
      18: "ثمانية عشر",
      19: "تسعة عشر",
    };
    parts.push(special[num] || "");
  } else if (num > 0) {
    parts.push(ones[num]);
  }

  return parts.filter(Boolean).join(" و");
}

export const stayTypeLabels: Record<string, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
};

/**
 * Legacy two-value classification ("room" | "apartment") used by older
 * surfaces (contracts, reservation detail) that pre-date the 4-category
 * `UnitType.category` model. Kept for backward compat; new code should
 * prefer `unitCategoryLabels` below.
 */
export const unitTypeLabels: Record<string, string> = {
  room: "غرفة فندقية",
  apartment: "شقة مفروشة",
};

/**
 * Singular Arabic label for each `UnitType.category` value. Used wherever
 * the operator picks a single category — most notably the "نوع الوحدة"
 * filter on the new-reservation form. The order of entries mirrors the
 * order we want to surface in dropdowns.
 */
export const unitCategoryLabels: Record<string, string> = {
  hotel_room: "غرفة فندقية",
  studio: "ستوديو مفروش",
  apartment: "شقة مفروشة",
  suite: "جناح فندقي",
};

/**
 * Plural-prefixed Arabic titles ("الـ…") for category-grouped section
 * headings on the rooms board. Studios are surfaced as their own group
 * here even though, for legacy pricing purposes, they collapse into the
 * "room" tier (see `legacyTypeFromCategory`).
 */
export const unitCategorySectionTitles: Record<string, string> = {
  hotel_room: "الغرف الفندقية",
  studio: "الستوديوهات المفروشة",
  apartment: "الشقق المفروشة",
  suite: "الأجنحة الفندقية",
};

export const statusLabels: Record<string, string> = {
  active: "ساري",
  upcoming: "قادم",
  completed: "منتهي",
  cancelled: "ملغي",
  available: "شاغرة",
  occupied: "مشغولة",
  maintenance: "صيانة",
  pending: "قيد الانتظار",
  in_progress: "قيد التنفيذ",
};

export const roleLabels: Record<string, string> = {
  admin: "مدير",
  receptionist: "موظف استقبال",
  accountant: "محاسب",
};
