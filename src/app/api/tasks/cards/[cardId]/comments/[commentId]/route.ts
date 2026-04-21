import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

async function loadComment(commentId: number) {
  return prisma.taskComment.findUnique({
    where: { id: commentId },
    include: { task: { select: { boardId: true } } },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ cardId: string; commentId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { commentId: raw } = await params;
    const commentId = Number(raw);
    if (!Number.isFinite(commentId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const comment = await loadComment(commentId);
    if (!comment || comment.deletedAt) {
      return NextResponse.json(
        { error: "لم يُعثر على التعليق" },
        { status: 404 },
      );
    }
    if (comment.authorId !== userId) {
      return NextResponse.json(
        { error: "لا يمكنك تعديل تعليق غيرك" },
        { status: 403 },
      );
    }
    await requireBoardAccess(comment.task.boardId, userId, "viewer");
    const body = await request.json().catch(() => ({}));
    const { body: text } = body as { body?: string };
    if (!text || !text.trim()) {
      return NextResponse.json({ error: "النص مطلوب" }, { status: 400 });
    }
    const updated = await prisma.taskComment.update({
      where: { id: commentId },
      data: { body: text.trim(), editedAt: new Date() },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    return NextResponse.json(updated);
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
    console.error("PATCH comment error:", error);
    return NextResponse.json({ error: "فشل تعديل التعليق" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string; commentId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { commentId: raw } = await params;
    const commentId = Number(raw);
    if (!Number.isFinite(commentId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const comment = await loadComment(commentId);
    if (!comment) return NextResponse.json({ ok: true });
    if (comment.authorId !== userId) {
      const access = await requireBoardAccess(
        comment.task.boardId,
        userId,
        "editor",
      );
      if (!access.isOwner) {
        return NextResponse.json(
          { error: "لا يمكنك حذف تعليق غيرك" },
          { status: 403 },
        );
      }
    } else {
      await requireBoardAccess(comment.task.boardId, userId, "viewer");
    }
    await prisma.taskComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
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
    console.error("DELETE comment error:", error);
    return NextResponse.json({ error: "فشل حذف التعليق" }, { status: 500 });
  }
}
