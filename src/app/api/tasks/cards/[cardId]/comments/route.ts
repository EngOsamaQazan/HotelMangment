import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:view");
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
    await requireBoardAccess(task.boardId, userId, "viewer");
    const comments = await prisma.taskComment.findMany({
      where: { taskId, deletedAt: null },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(comments);
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
    console.error("GET comments error:", error);
    return NextResponse.json({ error: "فشل تحميل التعليقات" }, { status: 500 });
  }
}

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
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignees: { select: { userId: true } } },
    });
    if (!task) {
      return NextResponse.json(
        { error: "لم يُعثر على البطاقة" },
        { status: 404 },
      );
    }
    await requireBoardAccess(task.boardId, userId, "editor");
    const body = await request.json().catch(() => ({}));
    const { body: commentBody } = body as { body?: string };
    if (!commentBody || !commentBody.trim()) {
      return NextResponse.json({ error: "نص التعليق مطلوب" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const c = await tx.taskComment.create({
        data: {
          taskId,
          authorId: userId,
          body: commentBody.trim(),
        },
        include: {
          author: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      });
      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: userId,
          type: "commented",
          payloadJson: { commentId: c.id },
        },
      });
      // Notify assignees (except commenter)
      const notifUsers = task.assignees
        .map((a) => a.userId)
        .filter((uid) => uid !== userId);
      if (notifUsers.length) {
        await tx.notification.createMany({
          data: notifUsers.map((uid) => ({
            userId: uid,
            type: "task.commented",
            title: "تعليق جديد على مهمة",
            body: task.title,
            linkUrl: `/tasks/${task.boardId}?task=${task.id}`,
            payloadJson: {
              taskId: task.id,
              boardId: task.boardId,
              commentId: c.id,
            },
          })),
        });
      }
      return c;
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
    console.error("POST comments error:", error);
    return NextResponse.json({ error: "فشل إضافة التعليق" }, { status: 500 });
  }
}
