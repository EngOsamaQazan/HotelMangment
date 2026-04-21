import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { maybeSweepLazy } from "@/lib/reservations/sweeper";

/**
 * Lightweight counters used by the reservations index page tabs + top strip.
 * Separated from the paginated `/api/reservations` list so switching filters
 * doesn't force us to recompute the totals every time.
 */
export async function GET() {
  try {
    await requirePermission("reservations:view");
    await maybeSweepLazy();

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);
    const endOfWeek = new Date(startOfDay);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const [
      active,
      upcoming,
      completed,
      cancelled,
      startingToday,
      endingToday,
      upcomingThisWeek,
    ] = await Promise.all([
      prisma.reservation.count({ where: { status: "active" } }),
      prisma.reservation.count({ where: { status: "upcoming" } }),
      prisma.reservation.count({ where: { status: "completed" } }),
      prisma.reservation.count({ where: { status: "cancelled" } }),
      prisma.reservation.count({
        where: {
          status: { in: ["active", "upcoming"] },
          checkIn: { gte: startOfDay, lt: endOfDay },
        },
      }),
      prisma.reservation.count({
        where: {
          status: "active",
          checkOut: { gte: startOfDay, lt: endOfDay },
        },
      }),
      prisma.reservation.count({
        where: {
          status: "upcoming",
          checkIn: { gte: startOfDay, lt: endOfWeek },
        },
      }),
    ]);

    return NextResponse.json({
      active,
      upcoming,
      completed,
      cancelled,
      startingToday,
      endingToday,
      upcomingThisWeek,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/reservations/summary error:", error);
    return NextResponse.json(
      { error: "Failed to compute summary" },
      { status: 500 },
    );
  }
}
