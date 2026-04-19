import { NextResponse } from "next/server";
import { databaseConfigurationError } from "@/lib/db-env";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET() {
  const configErr = databaseConfigurationError();
  if (configErr) return configErr;

  try {
    await requirePermission("dashboard:view");
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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/dashboard error:", error);
    const msg =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P1001"
        ? "تعذر الاتصال بقاعدة البيانات. تأكد من صحة DATABASE_URL في ملف .env (مثلاً نسخ الرابط من Supabase → Database → Connection string)."
        : "فشل تحميل بيانات لوحة التحكم";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
