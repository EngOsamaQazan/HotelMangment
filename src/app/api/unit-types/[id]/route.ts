import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";

interface BedInput {
  bedType: string;
  count?: number;
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

interface UnitTypeUpdate {
  nameAr?: string;
  nameEn?: string;
  category?: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  maxAdults?: number;
  maxChildren?: number;
  maxOccupancy?: number;
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
  /** Direct-booking fields */
  publiclyBookable?: boolean;
  basePriceDaily?: number | null;
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

function validateUpdate(data: UnitTypeUpdate): string | null {
  if (data.category && !VALID_CATEGORIES.includes(data.category)) return "فئة النوع غير صالحة";
  if (data.maxAdults !== undefined && (!Number.isInteger(data.maxAdults) || data.maxAdults < 1)) {
    return "الحد الأقصى للبالغين يجب أن يكون >= 1";
  }
  if (data.maxOccupancy !== undefined && (!Number.isInteger(data.maxOccupancy) || data.maxOccupancy < 1)) {
    return "السعة القصوى يجب أن تكون >= 1";
  }
  if (
    data.basePriceDaily !== undefined &&
    data.basePriceDaily !== null &&
    (!Number.isFinite(Number(data.basePriceDaily)) || Number(data.basePriceDaily) < 0)
  ) {
    return "السعر الأساسي اليومي يجب أن يكون رقمًا موجبًا";
  }
  if (data.rooms) {
    for (const r of data.rooms) {
      if (!r.nameAr?.trim() || !r.nameEn?.trim()) return "كل غرفة تحتاج اسم عربي وإنجليزي";
      if (!VALID_ROOM_KINDS.includes(r.kind)) return `نوع الغرفة غير صالح: ${r.kind}`;
      if (r.beds) {
        let extraBedCount = 0;
        for (const b of r.beds) {
          if (!VALID_BED_TYPES.includes(b.bedType)) return `نوع السرير غير صالح: ${b.bedType}`;
          if (b.count !== undefined && (!Number.isInteger(b.count) || b.count < 1)) {
            return "عدد الأسرّة يجب أن يكون رقمًا موجبًا";
          }
          if (b.sleepsExtra) extraBedCount += 1;
        }
        if (extraBedCount > 1) {
          return `غرفة «${r.nameAr}»: لا يمكن أن يوجد أكثر من سرير إضافي واحد في نفس الغرفة`;
        }
      }
    }
  }
  return null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.unit_types:view");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const type = await prisma.unitType.findUnique({
      where: { id },
      include: {
        rooms: { orderBy: { position: "asc" }, include: { beds: true } },
        amenities: { include: { amenity: true } },
        photos: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        units: {
          select: { id: true, unitNumber: true, status: true, bedSetup: true },
          orderBy: { unitNumber: "asc" },
        },
      },
    });
    if (!type) return NextResponse.json({ error: "نوع الوحدة غير موجود" }, { status: 404 });
    return NextResponse.json(type);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/unit-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch unit type" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.unit_types:edit");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = (await request.json()) as UnitTypeUpdate;
    const err = validateUpdate(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const existing = await prisma.unitType.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "نوع الوحدة غير موجود" }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    const simpleFields: (keyof UnitTypeUpdate)[] = [
      "nameAr",
      "nameEn",
      "category",
      "descriptionAr",
      "descriptionEn",
      "maxAdults",
      "maxChildren",
      "maxOccupancy",
      "sizeSqm",
      "hasKitchen",
      "hasBalcony",
      "smokingAllowed",
      "view",
      "bookingRoomId",
      "channelSync",
      "isActive",
      "sortOrder",
      "publiclyBookable",
      "basePriceDaily",
    ];
    for (const k of simpleFields) {
      if (body[k] !== undefined) updateData[k] = body[k];
    }

    // Transactional replace-children when rooms or amenityCodes provided.
    await prisma.$transaction(async (tx) => {
      if (Object.keys(updateData).length > 0) {
        await tx.unitType.update({ where: { id }, data: updateData });
      }

      if (body.rooms) {
        await tx.unitTypeRoom.deleteMany({ where: { unitTypeId: id } });
        for (const [idx, r] of body.rooms.entries()) {
          await tx.unitTypeRoom.create({
            data: {
              unitTypeId: id,
              nameAr: r.nameAr,
              nameEn: r.nameEn,
              kind: r.kind,
              position: r.position ?? idx,
              beds: r.beds && r.beds.length > 0
                ? {
                    create: r.beds.map((b) => ({
                      bedType: b.bedType,
                      count: b.count ?? 1,
                      sleepsExtra: b.sleepsExtra ?? false,
                      notes: b.notes ?? null,
                    })),
                  }
                : undefined,
            },
          });
        }
      }

      if (body.amenityCodes) {
        await tx.unitTypeAmenity.deleteMany({ where: { unitTypeId: id } });
        if (body.amenityCodes.length > 0) {
          const amenities = await tx.amenity.findMany({
            where: { code: { in: body.amenityCodes } },
            select: { id: true },
          });
          if (amenities.length > 0) {
            await tx.unitTypeAmenity.createMany({
              data: amenities.map((a) => ({ unitTypeId: id, amenityId: a.id })),
            });
          }
        }
      }
    });

    const refreshed = await prisma.unitType.findUnique({
      where: { id },
      include: {
        rooms: { orderBy: { position: "asc" }, include: { beds: true } },
        amenities: { include: { amenity: true } },
        photos: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      },
    });

    return NextResponse.json(refreshed);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/unit-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to update unit type" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.unit_types:delete");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const type = await prisma.unitType.findUnique({
      where: { id },
      include: { _count: { select: { units: true } } },
    });
    if (!type) return NextResponse.json({ error: "نوع الوحدة غير موجود" }, { status: 404 });

    if (type._count.units > 0) {
      return NextResponse.json(
        {
          error: `لا يمكن حذف النوع — هناك ${type._count.units} وحدة مرتبطة به. يمكنك تعطيله بدلًا من ذلك.`,
        },
        { status: 409 },
      );
    }

    await prisma.unitType.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/unit-types/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete unit type" }, { status: 500 });
  }
}
