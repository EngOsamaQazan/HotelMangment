import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

interface MapRow {
  id?: number;
  unitId?: number | null;
  unitTypeId?: number | null;
  extranetRoomId: string;
  extranetRoomName?: string | null;
  extranetRoomCode?: string | null;
  notes?: string | null;
}

/**
 * GET /api/booking/property-map — list all mappings with joined unit/unit-type info.
 */
export async function GET() {
  try {
    await requirePermission("settings.booking:view");
    const rows = await prisma.bookingPropertyMap.findMany({
      orderBy: { createdAt: "desc" },
    });

    const unitIds = rows.map((r) => r.unitId).filter((v): v is number => !!v);
    const typeIds = rows.map((r) => r.unitTypeId).filter((v): v is number => !!v);

    const [units, types] = await Promise.all([
      unitIds.length
        ? prisma.unit.findMany({
            where: { id: { in: unitIds } },
            select: { id: true, unitNumber: true, unitType: true },
          })
        : [],
      typeIds.length
        ? prisma.unitType.findMany({
            where: { id: { in: typeIds } },
            select: { id: true, code: true, nameAr: true, category: true },
          })
        : [],
    ]);

    const unitMap = new Map(units.map((u) => [u.id, u]));
    const typeMap = new Map(types.map((t) => [t.id, t]));

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        unit: r.unitId ? unitMap.get(r.unitId) || null : null,
        unitType: r.unitTypeId ? typeMap.get(r.unitTypeId) || null : null,
      })),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/booking/property-map:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * PUT /api/booking/property-map — replace full mapping set (bulk upsert).
 * Body: { rows: MapRow[] }. Rows without extranetRoomId are ignored.
 */
export async function PUT(request: Request) {
  try {
    await requirePermission("settings.booking:map");
    const body = (await request.json()) as { rows?: MapRow[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];

    for (const r of rows) {
      if (!r.extranetRoomId || !r.extranetRoomId.trim()) {
        return NextResponse.json({ error: "extranetRoomId مطلوب لكل سطر" }, { status: 400 });
      }
      if (!r.unitId && !r.unitTypeId) {
        return NextResponse.json(
          { error: "يجب اختيار وحدة أو نوع وحدة لكل سطر" },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // Delete rows not in the new set.
      const keepIds = rows.filter((r) => r.id).map((r) => r.id!) as number[];
      await tx.bookingPropertyMap.deleteMany({
        where: keepIds.length > 0 ? { NOT: { id: { in: keepIds } } } : {},
      });

      for (const r of rows) {
        if (r.id) {
          await tx.bookingPropertyMap.update({
            where: { id: r.id },
            data: {
              unitId: r.unitId ?? null,
              unitTypeId: r.unitTypeId ?? null,
              extranetRoomId: r.extranetRoomId.trim(),
              extranetRoomName: r.extranetRoomName ?? null,
              extranetRoomCode: r.extranetRoomCode ?? null,
              notes: r.notes ?? null,
            },
          });
        } else {
          await tx.bookingPropertyMap.create({
            data: {
              unitId: r.unitId ?? null,
              unitTypeId: r.unitTypeId ?? null,
              extranetRoomId: r.extranetRoomId.trim(),
              extranetRoomName: r.extranetRoomName ?? null,
              extranetRoomCode: r.extranetRoomCode ?? null,
              notes: r.notes ?? null,
            },
          });
        }
      }
    });

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/booking/property-map:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
