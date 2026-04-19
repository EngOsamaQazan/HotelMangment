import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET() {
  try {
    await requirePermission("settings.prices:view");
    const prices = await prisma.seasonalPrice.findMany({
      orderBy: { startDate: "asc" },
    });

    return NextResponse.json(prices);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/seasonal-prices error:", error);
    return NextResponse.json(
      { error: "Failed to fetch seasonal prices" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requirePermission("settings.prices:edit");
    const body = await request.json();
    const {
      id,
      seasonName,
      startDate,
      endDate,
      roomDaily,
      roomWeekly,
      roomMonthly,
      aptDaily,
      aptWeekly,
      aptMonthly,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Season ID is required" }, { status: 400 });
    }

    const existing = await prisma.seasonalPrice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Seasonal price not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (seasonName !== undefined) updateData.seasonName = seasonName;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = new Date(endDate);
    if (roomDaily !== undefined) updateData.roomDaily = Number(roomDaily);
    if (roomWeekly !== undefined) updateData.roomWeekly = Number(roomWeekly);
    if (roomMonthly !== undefined) updateData.roomMonthly = Number(roomMonthly);
    if (aptDaily !== undefined) updateData.aptDaily = Number(aptDaily);
    if (aptWeekly !== undefined) updateData.aptWeekly = Number(aptWeekly);
    if (aptMonthly !== undefined) updateData.aptMonthly = Number(aptMonthly);

    const updated = await prisma.seasonalPrice.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/seasonal-prices error:", error);
    return NextResponse.json(
      { error: "Failed to update seasonal price" },
      { status: 500 }
    );
  }
}
