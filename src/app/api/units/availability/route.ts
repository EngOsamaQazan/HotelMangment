import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { maybeSweepLazy } from "@/lib/reservations/sweeper";
import { legacyTypeFromUnitTypeRef } from "@/lib/units/legacy-type";

/**
 * Returns, for every unit, whether it is bookable for the requested window.
 *
 * Query params:
 *   - `checkIn`   — ISO datetime (required)
 *   - `checkOut`  — ISO datetime (required)
 *
 * A unit is considered available when:
 *   - it is NOT currently in `maintenance`, AND
 *   - it has NO active/upcoming reservation whose range overlaps
 *     `[checkIn, checkOut)`.
 *
 * The range test uses the standard overlap rule:
 *   `reservation.checkIn < requested.checkOut` AND
 *   `reservation.checkOut > requested.checkIn`.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("rooms:view");
    await maybeSweepLazy();

    const { searchParams } = new URL(request.url);
    const checkInParam = searchParams.get("checkIn");
    const checkOutParam = searchParams.get("checkOut");

    if (!checkInParam || !checkOutParam) {
      return NextResponse.json(
        { error: "Missing checkIn or checkOut" },
        { status: 400 },
      );
    }

    const checkIn = new Date(checkInParam);
    const checkOut = new Date(checkOutParam);
    if (
      Number.isNaN(checkIn.getTime()) ||
      Number.isNaN(checkOut.getTime()) ||
      checkOut <= checkIn
    ) {
      return NextResponse.json(
        { error: "Invalid date range" },
        { status: 400 },
      );
    }

    const units = await prisma.unit.findMany({
      orderBy: [{ floor: "asc" }, { unitNumber: "asc" }],
      include: {
        unitTypeRef: { select: { category: true } },
        reservations: {
          where: {
            status: { in: ["active", "upcoming"] },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
          select: {
            id: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
            status: true,
          },
        },
      },
    });

    const result = units.map((u) => {
      const conflict = u.reservations[0] || null;
      const isMaintenance = u.status === "maintenance";
      return {
        id: u.id,
        unitNumber: u.unitNumber,
        unitType: legacyTypeFromUnitTypeRef(u.unitTypeRef),
        unitTypeId: u.unitTypeId,
        floor: u.floor,
        status: u.status,
        available: !conflict && !isMaintenance,
        blockedReason: conflict
          ? `محجوزة من ${conflict.checkIn.toISOString()} حتى ${conflict.checkOut.toISOString()}`
          : isMaintenance
            ? "صيانة"
            : null,
        conflict: conflict
          ? {
              id: conflict.id,
              guestName: conflict.guestName,
              checkIn: conflict.checkIn.toISOString(),
              checkOut: conflict.checkOut.toISOString(),
              status: conflict.status,
            }
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/units/availability error:", error);
    return NextResponse.json(
      { error: "Failed to compute availability" },
      { status: 500 },
    );
  }
}
