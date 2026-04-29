import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { withLegacyUnitTypeOnReservation } from "@/lib/units/legacy-type";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return NextResponse.json({ error: "Report type is required (monthly or debts)" }, { status: 400 });
    }

    if (type === "monthly") {
      await requirePermission("reports.monthly:view");
      return getMonthlyReport(searchParams);
    }

    if (type === "debts") {
      await requirePermission("reports.debts:view");
      return getDebtsReport();
    }

    return NextResponse.json({ error: "Invalid report type. Use 'monthly' or 'debts'" }, { status: 400 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/reports error:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}

async function getMonthlyReport(searchParams: URLSearchParams) {
  const now = new Date();
  const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(now.getFullYear()));

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const [transactions, reservations, maintenance] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      include: {
        reservation: {
          select: { guestName: true, unit: { select: { unitNumber: true } } },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.reservation.findMany({
      where: {
        OR: [
          { checkIn: { gte: startDate, lte: endDate } },
          { checkOut: { gte: startDate, lte: endDate } },
          { checkIn: { lte: startDate }, checkOut: { gte: endDate } },
        ],
      },
      include: {
        unit: { include: { unitTypeRef: { select: { category: true } } } },
      },
      orderBy: { checkIn: "asc" },
    }),
    prisma.maintenance.findMany({
      where: {
        requestDate: { gte: startDate, lte: endDate },
      },
      include: {
        unit: { include: { unitTypeRef: { select: { category: true } } } },
      },
    }),
  ]);

  const reservationsOut = reservations.map(withLegacyUnitTypeOnReservation);
  const maintenanceOut = maintenance.map(withLegacyUnitTypeOnReservation);

  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const cashIncome = transactions
    .filter((t) => t.type === "income" && t.account === "cash")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const bankIncome = transactions
    .filter((t) => t.type === "income" && t.account === "bank")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const maintenanceCost = maintenance.reduce((sum, m) => sum + Number(m.cost), 0);

  return NextResponse.json({
    period: { month, year },
    summary: {
      totalIncome: income,
      totalExpenses: expenses,
      netProfit: income - expenses,
      cashIncome,
      bankIncome,
      maintenanceCost,
      totalReservations: reservations.length,
      completedReservations: reservations.filter((r) => r.status === "completed").length,
      activeReservations: reservations.filter((r) => r.status === "active").length,
      cancelledReservations: reservations.filter((r) => r.status === "cancelled").length,
    },
    transactions,
    reservations: reservationsOut,
    maintenance: maintenanceOut,
  });
}

async function getDebtsReport() {
  const reservations = await prisma.reservation.findMany({
    where: {
      remaining: { gt: 0 },
    },
    include: {
      unit: { include: { unitTypeRef: { select: { category: true } } } },
      transactions: {
        where: { type: "income" },
        orderBy: { date: "desc" },
      },
    },
    orderBy: { remaining: "desc" },
  });

  const totalDebts = reservations.reduce(
    (sum, r) => sum + Number(r.remaining),
    0
  );

  return NextResponse.json({
    totalDebts,
    count: reservations.length,
    reservations: reservations.map(withLegacyUnitTypeOnReservation),
  });
}
