import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { legacyTypeFromUnitTypeRef } from "@/lib/units/legacy-type";

export async function GET(request: Request) {
  try {
    await requirePermission("rooms:view");
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (type) {
      // The legacy `?type=room|apartment` filter used to hit a denormalised
      // `unit.unit_type` column. After Phase 4 the source of truth is
      // `UnitType.category`, so we translate the request into a relation
      // filter: anything other than "apartment" keeps the historical
      // behaviour of treating non-apartment categories as "room".
      if (type === "apartment") {
        where.unitTypeRef = { category: "apartment" };
      } else if (type === "room") {
        where.unitTypeRef = { category: { not: "apartment" } };
      } else {
        // Allow callers to pass a raw category if they want it.
        where.unitTypeRef = { category: type };
      }
    }
    if (status) where.status = status;

    const units = await prisma.unit.findMany({
      where,
      orderBy: { unitNumber: "asc" },
      include: {
        unitTypeRef: {
          include: {
            rooms: {
              orderBy: { position: "asc" },
              include: { beds: true },
            },
            amenities: { include: { amenity: true } },
            photos: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
    });

    // Project a stable `unitType: "room" | "apartment"` field for legacy
    // consumers (settings/booking page, contract templates) so the schema
    // change is invisible client-side.
    const result = units.map((u) => ({
      ...u,
      unitType: legacyTypeFromUnitTypeRef(u.unitTypeRef),
    }));

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/units error:", error);
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }
}
