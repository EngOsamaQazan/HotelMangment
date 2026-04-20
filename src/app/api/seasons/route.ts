import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

interface SeasonInput {
  nameAr?: string;
  nameEn?: string | null;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  sortOrder?: number;
}

function validate(body: SeasonInput, isCreate: boolean): string | null {
  if (isCreate) {
    if (!body.nameAr || !body.nameAr.trim()) return "اسم الموسم مطلوب";
    if (!body.startDate) return "تاريخ البداية مطلوب";
    if (!body.endDate) return "تاريخ النهاية مطلوب";
  }
  if (body.startDate && body.endDate) {
    const s = new Date(body.startDate).getTime();
    const e = new Date(body.endDate).getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) return "تاريخ غير صالح";
    if (s > e) return "تاريخ البداية يجب أن يسبق تاريخ النهاية";
  }
  return null;
}

export async function GET() {
  try {
    await requirePermission("settings.prices:view");
    const seasons = await prisma.season.findMany({
      orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
      include: {
        prices: {
          include: {
            unitType: {
              select: { id: true, code: true, nameAr: true, category: true, sortOrder: true },
            },
          },
        },
      },
    });
    return NextResponse.json(seasons);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/seasons error:", error);
    return NextResponse.json({ error: "Failed to fetch seasons" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("settings.prices:create");
    const body = (await request.json()) as SeasonInput;
    const err = validate(body, true);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const season = await prisma.season.create({
      data: {
        nameAr: body.nameAr!.trim(),
        nameEn: body.nameEn?.trim() || null,
        startDate: new Date(body.startDate!),
        endDate: new Date(body.endDate!),
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    // Initialise price rows (0) for every active unit type so the UI has a grid to edit.
    const types = await prisma.unitType.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (types.length > 0) {
      await prisma.unitTypePrice.createMany({
        data: types.map((t) => ({
          unitTypeId: t.id,
          seasonId: season.id,
          daily: 0,
          weekly: 0,
          monthly: 0,
        })),
        skipDuplicates: true,
      });
    }

    const full = await prisma.season.findUnique({
      where: { id: season.id },
      include: {
        prices: {
          include: {
            unitType: {
              select: { id: true, code: true, nameAr: true, category: true, sortOrder: true },
            },
          },
        },
      },
    });
    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/seasons error:", error);
    return NextResponse.json({ error: "Failed to create season" }, { status: 500 });
  }
}
