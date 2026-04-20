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
    const session = await requirePermission("tasks.cards:edit");
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
    const { labelIds } = body as { labelIds?: number[] };
    if (!Array.isArray(labelIds) || !labelIds.length) {
      return NextResponse.json(
        { error: "قائمة التسميات مطلوبة" },
        { status: 400 },
      );
    }
    const uniq = Array.from(new Set(labelIds.filter(Number.isFinite)));
    await prisma.taskLabelOnTask.createMany({
      data: uniq.map((lid) => ({ taskId, labelId: lid })),
      skipDuplicates: true,
    });
    const updated = await prisma.taskLabelOnTask.findMany({
      where: { taskId },
      include: { label: true },
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
    console.error("POST labels on task error:", error);
    return NextResponse.json({ error: "فشل إضافة التسمية" }, { status: 500 });
  }
}

export async function DELETE(
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
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ ok: true });
    await requireBoardAccess(task.boardId, userId, "editor");
    const { searchParams } = new URL(request.url);
    const labelId = Number(searchParams.get("labelId"));
    if (!Number.isFinite(labelId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await prisma.taskLabelOnTask.delete({
      where: { taskId_labelId: { taskId, labelId } },
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
    console.error("DELETE labels on task error:", error);
    return NextResponse.json({ error: "فشل إزالة التسمية" }, { status: 500 });
  }
}
