import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

const PRIORITIES = new Set(["low", "med", "high", "urgent"]);

/** GET /api/tasks/cards?boardId=X&assignee=Y&dueBefore=... */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("tasks.cards:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { searchParams } = new URL(request.url);
    const boardId = Number(searchParams.get("boardId"));
    if (!Number.isFinite(boardId)) {
      return NextResponse.json(
        { error: "معرف اللوحة مطلوب" },
        { status: 400 },
      );
    }
    await requireBoardAccess(boardId, userId, "viewer");

    const assignee = searchParams.get("assignee");
    const dueBefore = searchParams.get("dueBefore");
    const where: Record<string, unknown> = { boardId, archivedAt: null };
    if (assignee === "me") {
      where.assignees = { some: { userId } };
    } else if (assignee && !Number.isNaN(Number(assignee))) {
      where.assignees = { some: { userId: Number(assignee) } };
    }
    if (dueBefore) {
      const d = new Date(dueBefore);
      if (!Number.isNaN(d.getTime())) {
        where.dueAt = { lte: d };
      }
    }
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        labels: { include: { label: true } },
        _count: {
          select: {
            checklist: true,
            comments: true,
            attachments: true,
          },
        },
      },
      orderBy: [{ columnId: "asc" }, { position: "asc" }],
    });
    return NextResponse.json(tasks);
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
    console.error("GET /api/tasks/cards error:", error);
    return NextResponse.json({ error: "فشل تحميل البطاقات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("tasks.cards:create");
    const userId = Number((session.user as { id?: string | number }).id);
    const body = await request.json().catch(() => ({}));
    const {
      boardId,
      columnId,
      title,
      description,
      priority,
      dueAt,
      assigneeIds,
      labelIds,
    } = body as {
      boardId?: number;
      columnId?: number;
      title?: string;
      description?: string;
      priority?: string;
      dueAt?: string | null;
      assigneeIds?: number[];
      labelIds?: number[];
    };
    if (!Number.isFinite(boardId) || !Number.isFinite(columnId)) {
      return NextResponse.json(
        { error: "اللوحة والعمود مطلوبان" },
        { status: 400 },
      );
    }
    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "عنوان البطاقة مطلوب" },
        { status: 400 },
      );
    }
    await requireBoardAccess(boardId as number, userId, "editor");
    // Ensure column belongs to the board.
    const col = await prisma.taskColumn.findUnique({
      where: { id: columnId as number },
      select: { boardId: true },
    });
    if (!col || col.boardId !== boardId) {
      return NextResponse.json(
        { error: "العمود لا ينتمي لهذه اللوحة" },
        { status: 400 },
      );
    }
    const agg = await prisma.task.aggregate({
      where: { columnId: columnId as number },
      _max: { position: true },
    });
    const priorityKey =
      priority && PRIORITIES.has(priority) ? priority : "med";

    const created = await prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          boardId: boardId as number,
          columnId: columnId as number,
          title: title.trim(),
          description: description?.trim() || null,
          priority: priorityKey,
          dueAt: dueAt ? new Date(dueAt) : null,
          position: (agg._max.position ?? -1) + 1,
          createdById: userId,
        },
      });
      if (Array.isArray(assigneeIds) && assigneeIds.length) {
        const uniq = Array.from(
          new Set(assigneeIds.filter(Number.isFinite)),
        );
        if (uniq.length) {
          await tx.taskAssignee.createMany({
            data: uniq.map((uid) => ({ taskId: t.id, userId: uid })),
            skipDuplicates: true,
          });
          // create notifications for assignees (except self)
          const notifUsers = uniq.filter((uid) => uid !== userId);
          if (notifUsers.length) {
            await tx.notification.createMany({
              data: notifUsers.map((uid) => ({
                userId: uid,
                type: "task.assigned",
                title: "تم إسناد مهمة إليك",
                body: t.title,
                linkUrl: `/tasks/${boardId}?task=${t.id}`,
                payloadJson: { taskId: t.id, boardId },
              })),
            });
          }
        }
      }
      if (Array.isArray(labelIds) && labelIds.length) {
        const uniq = Array.from(new Set(labelIds.filter(Number.isFinite)));
        if (uniq.length) {
          await tx.taskLabelOnTask.createMany({
            data: uniq.map((lid) => ({ taskId: t.id, labelId: lid })),
            skipDuplicates: true,
          });
        }
      }
      await tx.taskActivity.create({
        data: {
          taskId: t.id,
          actorId: userId,
          type: "created",
          payloadJson: { columnId },
        },
      });
      return tx.task.findUniqueOrThrow({
        where: { id: t.id },
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
    const status = errStatus(error);
    if (status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    console.error("POST /api/tasks/cards error:", error);
    return NextResponse.json({ error: "فشل إنشاء البطاقة" }, { status: 500 });
  }
}
