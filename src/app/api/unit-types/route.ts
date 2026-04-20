import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";

interface BedInput {
  bedType: string;
  count?: number;
  combinable?: boolean;
  combinesToType?: string | null;
  sleepsExtra?: boolean;
  notes?: string | null;
}

interface RoomInput {
  nameAr: string;
  nameEn: string;
  kind: string;
  position?: number;
  beds?: BedInput[];
}

interface UnitTypeInput {
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  maxAdults: number;
  maxChildren?: number;
  maxOccupancy: number;
  sizeSqm?: number | null;
  hasKitchen?: boolean;
  hasBalcony?: boolean;
  smokingAllowed?: boolean;
  view?: string | null;
  bookingRoomId?: string | null;
  channelSync?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  rooms?: RoomInput[];
  amenityCodes?: string[];
}

const VALID_CATEGORIES = ["apartment", "hotel_room", "suite", "studio"];
const VALID_BED_TYPES = [
  "single",
  "double",
  "queen",
  "king",
  "sofa_bed",
  "bunk_bed",
  "crib",
  "arabic_floor_seating",
];
const VALID_ROOM_KINDS = ["bedroom", "living_room", "studio", "bathroom"];

function validate(data: UnitTypeInput): string | null {
  if (!data.code?.trim()) return "رمز النوع (code) مطلوب";
  if (!/^[A-Z0-9-]+$/.test(data.code)) return "رمز النوع يجب أن يحوي حروف كبيرة وأرقام وشَرْطات فقط";
  if (!data.nameAr?.trim()) return "الاسم العربي مطلوب";
  if (!data.nameEn?.trim()) return "الاسم الإنجليزي مطلوب";
  if (!VALID_CATEGORIES.includes(data.category)) return "فئة النوع غير صالحة";
  if (!Number.isInteger(data.maxAdults) || data.maxAdults < 1) return "الحد الأقصى للبالغين يجب أن يكون >= 1";
  if (!Number.isInteger(data.maxOccupancy) || data.maxOccupancy < 1) return "السعة القصوى يجب أن تكون >= 1";
  if (data.maxOccupancy < data.maxAdults) return "السعة القصوى يجب ألا تقل عن عدد البالغين";

  if (data.rooms) {
    for (const r of data.rooms) {
      if (!r.nameAr?.trim() || !r.nameEn?.trim()) return "كل غرفة تحتاج اسم عربي وإنجليزي";
      if (!VALID_ROOM_KINDS.includes(r.kind)) return `نوع الغرفة غير صالح: ${r.kind}`;
      if (r.beds) {
        for (const b of r.beds) {
          if (!VALID_BED_TYPES.includes(b.bedType)) return `نوع السرير غير صالح: ${b.bedType}`;
          if (b.count !== undefined && (!Number.isInteger(b.count) || b.count < 1)) {
            return "عدد الأسرّة يجب أن يكون رقمًا موجبًا";
          }
        }
      }
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await requirePermission("settings.unit_types:view");
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("active") === "true";

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (activeOnly) where.isActive = true;

    const types = await prisma.unitType.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: {
        rooms: {
          orderBy: { position: "asc" },
          include: { beds: true },
        },
        amenities: { include: { amenity: true } },
        photos: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        _count: { select: { units: true } },
      },
    });

    return NextResponse.json(types);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/unit-types error:", error);
    return NextResponse.json({ error: "Failed to fetch unit types" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("settings.unit_types:create");
    const body = (await request.json()) as UnitTypeInput;

    const err = validate(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const existing = await prisma.unitType.findUnique({ where: { code: body.code } });
    if (existing) {
      return NextResponse.json({ error: "هذا الرمز مستخدم مسبقًا" }, { status: 409 });
    }

    // Resolve amenity ids from codes
    let amenityIds: number[] = [];
    if (body.amenityCodes && body.amenityCodes.length > 0) {
      const amenities = await prisma.amenity.findMany({
        where: { code: { in: body.amenityCodes } },
        select: { id: true },
      });
      amenityIds = amenities.map((a) => a.id);
    }

    const created = await prisma.unitType.create({
      data: {
        code: body.code,
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        category: body.category,
        descriptionAr: body.descriptionAr ?? null,
        descriptionEn: body.descriptionEn ?? null,
        maxAdults: body.maxAdults,
        maxChildren: body.maxChildren ?? 0,
        maxOccupancy: body.maxOccupancy,
        sizeSqm: body.sizeSqm ?? null,
        hasKitchen: body.hasKitchen ?? false,
        hasBalcony: body.hasBalcony ?? false,
        smokingAllowed: body.smokingAllowed ?? false,
        view: body.view ?? null,
        bookingRoomId: body.bookingRoomId ?? null,
        channelSync: body.channelSync ?? false,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
        rooms: body.rooms
          ? {
              create: body.rooms.map((r, idx) => ({
                nameAr: r.nameAr,
                nameEn: r.nameEn,
                kind: r.kind,
                position: r.position ?? idx,
                beds: r.beds && r.beds.length > 0
                  ? {
                      create: r.beds.map((b) => ({
                        bedType: b.bedType,
                        count: b.count ?? 1,
                        combinable: b.combinable ?? false,
                        combinesToType: b.combinesToType ?? null,
                        sleepsExtra: b.sleepsExtra ?? false,
                        notes: b.notes ?? null,
                      })),
                    }
                  : undefined,
              })),
            }
          : undefined,
        amenities: amenityIds.length > 0
          ? {
              create: amenityIds.map((amenityId) => ({ amenityId })),
            }
          : undefined,
      },
      include: {
        rooms: { include: { beds: true }, orderBy: { position: "asc" } },
        amenities: { include: { amenity: true } },
        photos: true,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/unit-types error:", error);
    return NextResponse.json({ error: "Failed to create unit type" }, { status: 500 });
  }
}
