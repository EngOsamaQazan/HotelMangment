import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:assign");
    const userId = Number((session.user as { id?: string | number }).id);
    const { cardId: raw } = await params;
    const taskId = Number(raw);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json(
        { error: "لم يُعثر على البطاقة" },
        { status: 404 },
      );
    }
    await requireBoardAccess(task.boardId, userId, "editor");
    const body = await request.json().catch(() => ({}));
    const { userIds } = body as { userIds?: number[] };
    if (!Array.isArray(userIds) || !userIds.length) {
      return NextResponse.json(
        { error: "قائمة المستخدمين مطلوبة" },
        { status: 400 },
      );
    }
    const uniq = Array.from(new Set(userIds.filter(Number.isFinite)));
    await prisma.$transaction(async (tx) => {
      await tx.taskAssignee.createMany({
        data: uniq.map((uid) => ({ taskId, userId: uid })),
        skipDuplicates: true,
      });
      const notifUsers = uniq.filter((uid) => uid !== userId);
      if (notifUsers.length) {
        await tx.notification.createMany({
          data: notifUsers.map((uid) => ({
            userId: uid,
            type: "task.assigned",
            title: "تم إسناد مهمة إليك",
            body: task.title,
            linkUrl: `/tasks/${task.boardId}?task=${task.id}`,
            payloadJson: { taskId: task.id, boardId: task.boardId },
          })),
        });
      }
      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: userId,
          type: "assigned",
          payloadJson: { userIds: uniq },
        },
      });
    });
    const updated = await prisma.taskAssignee.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    return NextResponse.json(updated, { status: 201 });
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
    console.error("POST assignees error:", error);
    return NextResponse.json({ error: "فشل الإسناد" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:assign");
    const userId = Number((session.user as { id?: string | number }).id);
    const { cardId: raw } = await params;
    const taskId = Number(raw);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ ok: true });
    await requireBoardAccess(task.boardId, userId, "editor");
    const { searchParams } = new URL(request.url);
    const removeUserId = Number(searchParams.get("userId"));
    if (!Number.isFinite(removeUserId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await prisma.taskAssignee.deleteMany({
      where: { taskId, userId: removeUserId },
    });
    await prisma.taskActivity.create({
      data: {
        taskId,
        actorId: userId,
        type: "unassigned",
        payloadJson: { userId: removeUserId },
      },
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
    console.error("DELETE assignees error:", error);
    return NextResponse.json({ error: "فشل الإزالة" }, { status: 500 });
  }
}
