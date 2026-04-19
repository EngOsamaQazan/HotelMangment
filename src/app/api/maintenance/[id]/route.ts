import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postEntry, ACCOUNT_CODES } from "@/lib/accounting";

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

        const costNum = Number(updated.cost);
        if (costNum > 0 && existing.status !== "completed") {
          const alreadyPosted = await tx.journalEntry.findFirst({
            where: { source: "maintenance", sourceRefId: updated.id, status: "posted" },
          });
          if (!alreadyPosted) {
            await postEntry(tx, {
              date: updated.completionDate ?? new Date(),
              description: `صيانة ${updated.unit.unitNumber} - ${updated.description}`,
              source: "maintenance",
              sourceRefId: updated.id,
              lines: [
                {
                  accountCode: ACCOUNT_CODES.EXPENSE_MAINTENANCE,
                  debit: costNum,
                  description: updated.contractor
                    ? `مقاول: ${updated.contractor}`
                    : undefined,
                },
                { accountCode: ACCOUNT_CODES.CASH, credit: costNum },
              ],
            });
            await tx.transaction.create({
              data: {
                date: updated.completionDate ?? new Date(),
                description: `صيانة ${updated.unit.unitNumber} - ${updated.description}`,
                amount: costNum,
                type: "expense",
                account: "cash",
              },
            });
          }
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
