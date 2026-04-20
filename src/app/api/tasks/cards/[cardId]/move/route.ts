import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

/**
 * POST /api/tasks/cards/[cardId]/move
 * body: { columnId: number, position: number }
 *
 * Moves a card to a new column and/or position, compacting the positions of
 * both the source and destination columns within a single transaction.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { cardId: raw } = await params;
    const taskId = Number(raw);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const targetColumnId = Number(body.columnId);
    const targetPosition = Number(body.position ?? 0);
    if (!Number.isFinite(targetColumnId)) {
      return NextResponse.json(
        { error: "معرف العمود الهدف مطلوب" },
        { status: 400 },
      );
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json(
        { error: "لم يُعثر على البطاقة" },
        { status: 404 },
      );
    }
    await requireBoardAccess(task.boardId, userId, "editor");

    const targetCol = await prisma.taskColumn.findUnique({
      where: { id: targetColumnId },
      select: { boardId: true },
    });
    if (!targetCol || targetCol.boardId !== task.boardId) {
      return NextResponse.json(
        { error: "العمود الهدف لا ينتمي لنفس اللوحة" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const fromCol = task.columnId;
      const toCol = targetColumnId;
      // Gather target column tasks (excluding current task if same column).
      const targetTasks = await tx.task.findMany({
        where: { columnId: toCol, id: { not: taskId } },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const insertAt = Math.max(
        0,
        Math.min(targetPosition, targetTasks.length),
      );
      const reordered = [
        ...targetTasks.slice(0, insertAt).map((t) => t.id),
        taskId,
        ...targetTasks.slice(insertAt).map((t) => t.id),
      ];
      // Update positions for target column
      for (let i = 0; i < reordered.length; i++) {
        await tx.task.update({
          where: { id: reordered[i] },
          data: {
            columnId: toCol,
            position: i,
          },
        });
      }
      // Compact source column (if different)
      if (fromCol !== toCol) {
        const srcTasks = await tx.task.findMany({
          where: { columnId: fromCol, id: { not: taskId } },
          orderBy: { position: "asc" },
          select: { id: true },
        });
        for (let i = 0; i < srcTasks.length; i++) {
          await tx.task.update({
            where: { id: srcTasks[i].id },
            data: { position: i },
          });
        }
      }
      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: userId,
          type: "moved",
          payloadJson: { fromColumnId: fromCol, toColumnId: toCol },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    const status = errStatus(error);
    if (status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    console.error("POST move error:", error);
    return NextResponse.json({ error: "فشل نقل البطاقة" }, { status: 500 });
  }
}
