import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const [
      totalUnits,
      occupiedUnits,
      maintenanceUnits,
      activeReservations,
      todayCheckInsList,
      todayCheckOutsList,
      debtReservations,
    ] = await Promise.all([
      prisma.unit.count(),
      prisma.unit.count({ where: { status: "occupied" } }),
      prisma.unit.count({ where: { status: "maintenance" } }),
      prisma.reservation.count({ where: { status: "active" } }),

      prisma.reservation.findMany({
        where: { checkIn: { gte: startOfDay, lte: endOfDay } },
        include: { unit: true },
      }),

      prisma.reservation.findMany({
        where: { checkOut: { gte: startOfDay, lte: endOfDay } },
        include: { unit: true },
      }),

      prisma.reservation.findMany({
        where: { remaining: { gt: 0 } },
        include: { unit: true },
        orderBy: { remaining: "desc" },
        take: 5,
      }),
    ]);

    const available = totalUnits - occupiedUnits - maintenanceUnits;

    const todayActivity = [
      ...todayCheckInsList.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        unitNumber: r.unit.unitNumber,
        type: "checkin" as const,
      })),
      ...todayCheckOutsList.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        unitNumber: r.unit.unitNumber,
        type: "checkout" as const,
      })),
    ];

    const totalDebts = debtReservations.reduce((sum, r) => sum + Number(r.remaining), 0);

    return NextResponse.json({
      stats: {
        totalUnits,
        occupied: occupiedUnits,
        available,
        activeReservations,
      },
      todayActivity,
      debts: {
        totalDebts,
        topDebtors: debtReservations.map((r) => ({
          id: r.id,
          guestName: r.guestName,
          amount: Number(r.remaining),
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
