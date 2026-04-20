import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("maintenance:view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const unitId = searchParams.get("unitId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (unitId) {
      where.unitId = parseInt(unitId);
    }

    const maintenanceList = await prisma.maintenance.findMany({
      where,
      include: {
        unit: true,
        task: {
          select: {
            id: true,
            boardId: true,
            title: true,
            completedAt: true,
            board: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { requestDate: "desc" },
    });

    return NextResponse.json(maintenanceList);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/maintenance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch maintenance records" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("maintenance:create");
    const body = await request.json();
    const { unitId, description, contractor, cost, notes } = body;

    if (!unitId || !description) {
      return NextResponse.json(
        { error: "Missing required fields: unitId, description" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const maintenance = await prisma.$transaction(async (tx) => {
      const record = await tx.maintenance.create({
        data: {
          unitId,
          description,
          contractor: contractor || null,
          cost: cost ? Number(cost) : 0,
          status: "pending",
          requestDate: new Date(),
          notes: notes || null,
        },
        include: { unit: true },
      });

      await tx.unit.update({
        where: { id: unitId },
        data: { status: "maintenance" },
      });

      return record;
    });

    return NextResponse.json(maintenance, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/maintenance error:", error);
    return NextResponse.json(
      { error: "Failed to create maintenance record" },
      { status: 500 }
    );
  }
}
