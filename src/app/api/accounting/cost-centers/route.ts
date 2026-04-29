import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("accounting.cost-centers:view");
    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get("stats") === "1";
    const onlyActive = searchParams.get("active") === "1";

    const where = onlyActive ? { isActive: true } : {};
    const centers = await prisma.costCenter.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { children: true, lines: true } },
      },
    });

    if (!includeStats) {
      return NextResponse.json({ centers });
    }

    // Aggregate debit/credit totals per cost center.
    const totals = await prisma.journalLine.groupBy({
      by: ["costCenterId"],
      _sum: { debit: true, credit: true },
      where: { costCenterId: { in: centers.map((c) => c.id) } },
    });
    const map = new Map<number, { debit: number; credit: number }>();
    for (const t of totals) {
      if (t.costCenterId == null) continue;
      map.set(t.costCenterId, {
        debit: t._sum.debit ?? 0,
        credit: t._sum.credit ?? 0,
      });
    }
    const enriched = centers.map((c) => {
      const t = map.get(c.id) ?? { debit: 0, credit: 0 };
      return {
        ...c,
        debitTotal: t.debit,
        creditTotal: t.credit,
        balance: t.debit - t.credit,
      };
    });
    return NextResponse.json({ centers: enriched });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/cost-centers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cost centers" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("accounting.cost-centers:create");
    const body = await request.json();
    const { code, name, description, parentId } = body ?? {};

    if (!code || !name) {
      return NextResponse.json(
        { error: "الحقول المطلوبة: code, name" },
        { status: 400 }
      );
    }

    const trimmedCode = String(code).trim();
    const trimmedName = String(name).trim();
    if (!trimmedCode || !trimmedName) {
      return NextResponse.json(
        { error: "الرمز والاسم مطلوبان" },
        { status: 400 }
      );
    }

    const existing = await prisma.costCenter.findUnique({
      where: { code: trimmedCode },
    });
    if (existing) {
      return NextResponse.json(
        { error: "رمز مركز التكلفة موجود مسبقاً" },
        { status: 409 }
      );
    }

    if (parentId) {
      const parent = await prisma.costCenter.findUnique({
        where: { id: Number(parentId) },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "مركز التكلفة الأب غير موجود" },
          { status: 400 }
        );
      }
    }

    const center = await prisma.costCenter.create({
      data: {
        code: trimmedCode,
        name: trimmedName,
        description: description ? String(description).trim() || null : null,
        parentId: parentId ? Number(parentId) : null,
        isActive: true,
      },
    });

    return NextResponse.json(center, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/accounting/cost-centers error:", error);
    return NextResponse.json(
      { error: "Failed to create cost center" },
      { status: 500 }
    );
  }
}
