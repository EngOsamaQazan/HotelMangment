import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

interface SeasonUpdate {
  nameAr?: string;
  nameEn?: string | null;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.prices:view");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const season = await prisma.season.findUnique({
      where: { id },
      include: {
        prices: {
          include: {
            unitType: {
              select: {
                id: true,
                code: true,
                nameAr: true,
                category: true,
                sortOrder: true,
                isActive: true,
              },
            },
          },
        },
      },
    });
    if (!season) return NextResponse.json({ error: "الموسم غير موجود" }, { status: 404 });
    return NextResponse.json(season);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/seasons/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch season" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.prices:edit");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = (await request.json()) as SeasonUpdate;

    if (body.startDate && body.endDate) {
      const s = new Date(body.startDate).getTime();
      const e = new Date(body.endDate).getTime();
      if (Number.isNaN(s) || Number.isNaN(e))
        return NextResponse.json({ error: "تاريخ غير صالح" }, { status: 400 });
      if (s > e)
        return NextResponse.json(
          { error: "تاريخ البداية يجب أن يسبق تاريخ النهاية" },
          { status: 400 },
        );
    }

    const data: Record<string, unknown> = {};
    if (body.nameAr !== undefined) data.nameAr = body.nameAr;
    if (body.nameEn !== undefined) data.nameEn = body.nameEn;
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate);
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const updated = await prisma.season.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/seasons/[id] error:", error);
    return NextResponse.json({ error: "Failed to update season" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.prices:delete");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await prisma.season.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/seasons/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete season" }, { status: 500 });
  }
}
