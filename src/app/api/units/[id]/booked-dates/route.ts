import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { maybeSweepLazy } from "@/lib/reservations/sweeper";

/**
 * Return the list of (checkIn, checkOut, status, guestName) ranges that
 * block a given unit for the next `months` months (default 12). Used by
 * the date picker in the new-reservation form to disable unavailable days.
 *
 * Optional query param `excludeReservationId` omits a specific reservation
 * from the blocked set (handy for the extend/edit flows so the picker does
 * not mark the reservation's own window as blocked against itself).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("reservations:view");
    const { id } = await params;
    const unitId = parseInt(id);
    if (Number.isNaN(unitId)) {
      return NextResponse.json({ error: "Invalid unit id" }, { status: 400 });
    }

    await maybeSweepLazy();

    const { searchParams } = new URL(request.url);
    const months = Math.max(1, Math.min(24, parseInt(searchParams.get("months") || "12")));
    const excludeRaw = searchParams.get("excludeReservationId");
    const excludeReservationId = excludeRaw ? parseInt(excludeRaw) : null;

    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setMonth(windowEnd.getMonth() + months);

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const reservations = await prisma.reservation.findMany({
      where: {
        unitId,
        status: { in: ["active", "upcoming"] },
        checkOut: { gt: now },
        checkIn: { lt: windowEnd },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: {
        id: true,
        guestName: true,
        status: true,
        checkIn: true,
        checkOut: true,
      },
      orderBy: { checkIn: "asc" },
    });

    return NextResponse.json({
      unitId,
      unitNumber: unit.unitNumber,
      unitStatus: unit.status,
      maintenance: unit.status === "maintenance",
      ranges: reservations.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        status: r.status,
        checkIn: r.checkIn.toISOString(),
        checkOut: r.checkOut.toISOString(),
      })),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/units/[id]/booked-dates error:", error);
    return NextResponse.json(
      { error: "Failed to fetch booked dates" },
      { status: 500 },
    );
  }
}
