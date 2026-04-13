import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const maintenanceId = parseInt(id);

    if (isNaN(maintenanceId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.maintenance.findUnique({
      where: { id: maintenanceId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Maintenance record not found" }, { status: 404 });
    }

    const body = await request.json();
    const { description, contractor, cost, status, completionDate, notes } = body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};

    if (description !== undefined) updateData.description = description;
    if (contractor !== undefined) updateData.contractor = contractor;
    if (cost !== undefined) updateData.cost = Number(cost);
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;
    if (completionDate !== undefined) {
      updateData.completionDate = completionDate ? new Date(completionDate) : null;
    }

    if (status === "completed" && !completionDate) {
      updateData.completionDate = new Date();
    }

    const maintenance = await prisma.$transaction(async (tx) => {
      const updated = await tx.maintenance.update({
        where: { id: maintenanceId },
        data: updateData,
        include: { unit: true },
      });

      if (status === "completed") {
        const pendingCount = await tx.maintenance.count({
          where: {
            unitId: existing.unitId,
            status: { not: "completed" },
            id: { not: maintenanceId },
          },
        });

        if (pendingCount === 0) {
          const hasActiveReservation = await tx.reservation.count({
            where: { unitId: existing.unitId, status: "active" },
          });

          await tx.unit.update({
            where: { id: existing.unitId },
            data: { status: hasActiveReservation > 0 ? "occupied" : "available" },
          });
        }
      }

      return updated;
    });

    return NextResponse.json(maintenance);
  } catch (error) {
    console.error("PUT /api/maintenance/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update maintenance record" },
      { status: 500 }
    );
  }
}
