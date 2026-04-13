import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("ar-JO-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatAmount(amount: number | string | null): string {
  if (amount === null || amount === undefined) return "0.00";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return num.toLocaleString("ar-JO-u-nu-latn", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export const unitTypeLabels: Record<string, string> = {
  room: "غرفة فندقية",
  apartment: "شقة مفروشة",
};

export const statusLabels: Record<string, string> = {
  active: "نشط",
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
