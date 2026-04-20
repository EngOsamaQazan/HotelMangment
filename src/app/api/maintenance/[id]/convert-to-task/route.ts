import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

/**
 * Convert a maintenance record into a linked Task card.
 * Requires both maintenance edit and tasks.cards create permissions.
 *
 * POST /api/maintenance/[id]/convert-to-task
 * Body: { boardId: number, columnId: number, assigneeIds?: number[], priority?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("maintenance:edit");
    const session = await requirePermission("tasks.cards:create");
    const userId = Number((session.user as { id?: string | number }).id);

    const { id } = await params;
    const maintenanceId = Number(id);
    if (!Number.isFinite(maintenanceId)) {
      return NextResponse.json(
        { error: "معرف غير صالح" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { boardId, columnId, assigneeIds, priority } = body as {
      boardId?: number;
      columnId?: number;
      assigneeIds?: number[];
      priority?: string;
    };

    if (!Number.isFinite(boardId) || !Number.isFinite(columnId)) {
      return NextResponse.json(
        { error: "اللوحة والعمود مطلوبان" },
        { status: 400 },
      );
    }

    const maintenance = await prisma.maintenance.findUnique({
      where: { id: maintenanceId },
      include: { unit: true, task: { select: { id: true, boardId: true } } },
    });
    if (!maintenance) {
      return NextResponse.json(
        { error: "سجل الصيانة غير موجود" },
        { status: 404 },
      );
    }
    if (maintenance.task) {
      return NextResponse.json(
        {
          error: "هذا السجل مرتبط ببطاقة مهمة بالفعل",
          task: maintenance.task,
        },
        { status: 409 },
      );
    }

    await requireBoardAccess(boardId as number, userId, "editor");

    const column = await prisma.taskColumn.findUnique({
      where: { id: columnId as number },
      select: { boardId: true },
    });
    if (!column || column.boardId !== boardId) {
      return NextResponse.json(
        { error: "العمود لا ينتمي لهذه اللوحة" },
        { status: 400 },
      );
    }

    const title = `صيانة الوحدة ${maintenance.unit.unitNumber} — ${maintenance.description.slice(0, 60)}`;

    const descriptionLines = [
      `سجل صيانة #${maintenance.id}`,
      `الوحدة: ${maintenance.unit.unitNumber}`,
      maintenance.description,
    ];
    if (maintenance.contractor) {
      descriptionLines.push(`المقاول/الفني: ${maintenance.contractor}`);
    }
    if (Number(maintenance.cost) > 0) {
      descriptionLines.push(`التكلفة المقدّرة: ${maintenance.cost} د.أ`);
    }
    if (maintenance.notes) {
      descriptionLines.push(`ملاحظات: ${maintenance.notes}`);
    }
    const description = descriptionLines.join("\n");

    const allowedPriorities = new Set(["low", "med", "high", "urgent"]);
    const priorityKey =
      priority && allowedPriorities.has(priority) ? priority : "high";

    const created = await prisma.$transaction(async (tx) => {
      const agg = await tx.task.aggregate({
        where: { columnId: columnId as number },
        _max: { position: true },
      });

      const task = await tx.task.create({
        data: {
          boardId: boardId as number,
          columnId: columnId as number,
          title,
          description,
          priority: priorityKey,
          position: (agg._max.position ?? -1) + 1,
          createdById: userId,
          maintenanceId: maintenance.id,
        },
      });

      if (Array.isArray(assigneeIds) && assigneeIds.length) {
        const unique = Array.from(
          new Set(assigneeIds.filter((n) => Number.isFinite(n))),
        );
        if (unique.length) {
          await tx.taskAssignee.createMany({
            data: unique.map((uid) => ({ taskId: task.id, userId: uid })),
            skipDuplicates: true,
          });
          const notifUsers = unique.filter((uid) => uid !== userId);
          if (notifUsers.length) {
            await tx.notification.createMany({
              data: notifUsers.map((uid) => ({
                userId: uid,
                type: "task.assigned",
                title: "تم إسناد مهمة صيانة إليك",
                body: task.title,
                linkUrl: `/tasks/${boardId}?task=${task.id}`,
                payloadJson: {
                  taskId: task.id,
                  boardId,
                  maintenanceId: maintenance.id,
                },
              })),
            });
          }
        }
      }

      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          actorId: userId,
          type: "created",
          payloadJson: {
            source: "maintenance",
            maintenanceId: maintenance.id,
          },
        },
      });

      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        include: {
          assignees: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          labels: { include: { label: true } },
          _count: {
            select: { checklist: true, comments: true, attachments: true },
          },
        },
      });
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    const status =
      typeof error === "object" && error && "status" in error
        ? (error as { status: number }).status
        : 500;
    if (status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    console.error("POST /api/maintenance/[id]/convert-to-task error:", error);
    return NextResponse.json(
      { error: "فشل إنشاء بطاقة المهمة" },
      { status: 500 },
    );
  }
}
