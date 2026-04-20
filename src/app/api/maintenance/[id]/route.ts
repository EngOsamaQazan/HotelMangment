import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { completeMaintenanceInTx } from "@/lib/maintenance/complete";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("maintenance:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const maintenanceId = parseInt(id);

    if (isNaN(maintenanceId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.maintenance.findUnique({
      where: { id: maintenanceId },
      include: { task: { select: { id: true, completedAt: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Maintenance record not found" }, { status: 404 });
    }

    const body = await request.json();
    const { description, contractor, cost, status, completionDate, notes } = body;

    const maintenance = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {};
      if (description !== undefined) updateData.description = description;
      if (contractor !== undefined) updateData.contractor = contractor;
      if (cost !== undefined) updateData.cost = Number(cost);
      if (notes !== undefined) updateData.notes = notes;

      // Non-completion field changes are applied first.
      if (Object.keys(updateData).length > 0) {
        await tx.maintenance.update({
          where: { id: maintenanceId },
          data: updateData,
        });
      }

      if (status === "completed" && existing.status !== "completed") {
        await completeMaintenanceInTx(tx, maintenanceId, {
          completionDate: completionDate ? new Date(completionDate) : undefined,
        });
        // Cascade: mark linked task as completed too (one-way; task PATCH
        // short-circuits when maintenance is already completed to avoid loops).
        if (existing.task && !existing.task.completedAt) {
          await tx.task.update({
            where: { id: existing.task.id },
            data: { completedAt: new Date() },
          });
          await tx.taskActivity.create({
            data: {
              taskId: existing.task.id,
              actorId: userId,
              type: "completed",
              payloadJson: {
                trigger: "maintenance",
                maintenanceId,
              },
            },
          });
        }
      } else if (status !== undefined && status !== "completed") {
        // Reopen / change to other status without cascading to task.
        const data: Record<string, unknown> = { status };
        if (completionDate !== undefined) {
          data.completionDate = completionDate ? new Date(completionDate) : null;
        }
        await tx.maintenance.update({
          where: { id: maintenanceId },
          data,
        });
      } else if (completionDate !== undefined && status === undefined) {
        await tx.maintenance.update({
          where: { id: maintenanceId },
          data: {
            completionDate: completionDate ? new Date(completionDate) : null,
          },
        });
      }

      return tx.maintenance.findUniqueOrThrow({
        where: { id: maintenanceId },
        include: {
          unit: true,
          task: { select: { id: true, boardId: true, title: true, completedAt: true } },
        },
      });
    });

    return NextResponse.json(maintenance);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/maintenance/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update maintenance record" },
      { status: 500 }
    );
  }
}
