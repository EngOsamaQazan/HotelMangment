import { Bed, BedDouble, BedSingle, Baby, Sofa, Armchair } from "lucide-react";

export const BED_TYPES = [
  { code: "single", labelAr: "سرير مفرد", labelEn: "Single", icon: BedSingle },
  { code: "double", labelAr: "سرير مزدوج", labelEn: "Double", icon: BedDouble },
  { code: "queen", labelAr: "سرير Queen", labelEn: "Queen", icon: BedDouble },
  { code: "king", labelAr: "سرير King", labelEn: "King", icon: BedDouble },
  { code: "sofa_bed", labelAr: "كنبة سرير", labelEn: "Sofa Bed", icon: Sofa },
  { code: "bunk_bed", labelAr: "سرير بطابقين", labelEn: "Bunk Bed", icon: Bed },
  { code: "crib", labelAr: "سرير أطفال", labelEn: "Crib", icon: Baby },
  {
    code: "arabic_floor_seating",
    labelAr: "جلسة عربية أرضية",
    labelEn: "Arabic Floor Seating",
    icon: Armchair,
  },
] as const;

export type BedTypeCode = (typeof BED_TYPES)[number]["code"];

export const ROOM_KINDS = [
  { code: "bedroom", labelAr: "غرفة نوم" },
  { code: "living_room", labelAr: "صالة" },
  { code: "studio", labelAr: "ستديو" },
  { code: "bathroom", labelAr: "حمّام" },
] as const;

export const UNIT_CATEGORIES = [
  { code: "apartment", labelAr: "شقة" },
  { code: "hotel_room", labelAr: "غرفة فندقية" },
  { code: "suite", labelAr: "جناح" },
  { code: "studio", labelAr: "ستديو" },
] as const;

interface BedIconProps {
  bedType: string;
  size?: number;
  className?: string;
}

export function BedIcon({ bedType, size = 16, className }: BedIconProps) {
  const def = BED_TYPES.find((b) => b.code === bedType);
  const Icon = def?.icon ?? Bed;
  return <Icon size={size} className={className} />;
}

export function bedLabel(bedType: string): string {
  return BED_TYPES.find((b) => b.code === bedType)?.labelAr ?? bedType;
}

export function roomKindLabel(kind: string): string {
  return ROOM_KINDS.find((k) => k.code === kind)?.labelAr ?? kind;
}

export function categoryLabel(code: string): string {
  return UNIT_CATEGORIES.find((c) => c.code === code)?.labelAr ?? code;
}

interface Bed {
  bedType: string;
  count: number;
  combinable?: boolean;
  sleepsExtra?: boolean;
}

interface Room {
  kind: string;
  beds?: Bed[];
}

/** Short Arabic summary: e.g. "سرير Queen · 2× مفرد (قابلان للدمج)". */
export function summarizeBeds(rooms: Room[] | undefined | null): string {
  if (!rooms || rooms.length === 0) return "—";
  const parts: string[] = [];
  for (const r of rooms) {
    const beds = r.beds ?? [];
    for (const b of beds) {
      if (b.bedType === "arabic_floor_seating" && b.sleepsExtra) {
        parts.push("جلسة عربية (+1 للنوم)");
      } else if (b.bedType === "arabic_floor_seating") {
        parts.push("جلسة عربية");
      } else {
        const label = bedLabel(b.bedType);
        const prefix = b.count > 1 ? `${b.count}× ` : "";
        const suffix = b.combinable ? " (قابل للدمج)" : "";
        parts.push(`${prefix}${label}${suffix}`);
      }
    }
  }
  return parts.join(" · ");
}
