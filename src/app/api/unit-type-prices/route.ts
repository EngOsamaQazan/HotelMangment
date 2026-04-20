import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

interface PriceRow {
  unitTypeId: number;
  seasonId: number;
  daily: number;
  weekly: number;
  monthly: number;
}

/**
 * GET /api/unit-type-prices?seasonId=N
 *   -> returns prices for the given season (or all seasons if no filter).
 */
export async function GET(request: Request) {
  try {
    await requirePermission("settings.prices:view");
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get("seasonId");
    const where = seasonId ? { seasonId: Number(seasonId) } : {};
    const rows = await prisma.unitTypePrice.findMany({
      where,
      include: {
        unitType: { select: { id: true, code: true, nameAr: true, category: true, sortOrder: true } },
        season: { select: { id: true, nameAr: true, startDate: true, endDate: true } },
      },
      orderBy: [{ seasonId: "asc" }, { unitTypeId: "asc" }],
    });
    return NextResponse.json(rows);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/unit-type-prices error:", error);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}

/**
 * PUT /api/unit-type-prices
 * Body: { rows: PriceRow[] }
 * Upserts many rows in a transaction. Returns { updated: number }.
 */
export async function PUT(request: Request) {
  try {
    await requirePermission("settings.prices:edit");
    const body = (await request.json()) as { rows?: PriceRow[] };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ updated: 0 });

    for (const r of rows) {
      if (!Number.isFinite(r.unitTypeId) || !Number.isFinite(r.seasonId)) {
        return NextResponse.json({ error: "معرّفات غير صالحة" }, { status: 400 });
      }
      if ([r.daily, r.weekly, r.monthly].some((v) => Number.isNaN(Number(v)) || Number(v) < 0)) {
        return NextResponse.json({ error: "أسعار غير صالحة" }, { status: 400 });
      }
    }

    await prisma.$transaction(
      rows.map((r) =>
        prisma.unitTypePrice.upsert({
          where: { unitTypeId_seasonId: { unitTypeId: r.unitTypeId, seasonId: r.seasonId } },
          update: {
            daily: Number(r.daily),
            weekly: Number(r.weekly),
            monthly: Number(r.monthly),
          },
          create: {
            unitTypeId: r.unitTypeId,
            seasonId: r.seasonId,
            daily: Number(r.daily),
            weekly: Number(r.weekly),
            monthly: Number(r.monthly),
          },
        }),
      ),
    );

    return NextResponse.json({ updated: rows.length });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/unit-type-prices error:", error);
    return NextResponse.json({ error: "Failed to update prices" }, { status: 500 });
  }
}
