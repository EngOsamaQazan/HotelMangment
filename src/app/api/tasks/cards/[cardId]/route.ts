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

async function loadTaskOrError(taskId: number) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  return task;
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
    const task = await loadTaskOrError(taskId);
    if (!task) {
      return NextResponse.json(
        { error: "لم يُعثر على البطاقة" },
        { status: 404 },
      );
    }
    await requireBoardAccess(task.boardId, userId, "viewer");
    const full = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignees: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        labels: { include: { label: true } },
        checklist: { orderBy: { position: "asc" } },
        attachments: {
          include: {
            uploadedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        comments: {
          where: { deletedAt: null },
          include: {
            author: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        activities: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        createdBy: { select: { id: true, name: true, email: true } },
        column: { select: { id: true, name: true } },
        board: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(full);
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
    console.error("GET task error:", error);
    return NextResponse.json({ error: "فشل تحميل البطاقة" }, { status: 500 });
  }
}

export async function PATCH(
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
    const task = await loadTaskOrError(taskId);
    if (!task) {
      return NextResponse.json(
        { error: "لم يُعثر على البطاقة" },
        { status: 404 },
      );
    }
    await requireBoardAccess(task.boardId, userId, "editor");
    const body = await request.json().catch(() => ({}));
    const {
      title,
      description,
      priority,
      dueAt,
      startAt,
      completed,
    } = body as {
      title?: string;
      description?: string | null;
      priority?: string;
      dueAt?: string | null;
      startAt?: string | null;
      completed?: boolean;
    };
    const data: Record<string, unknown> = {};
    if (typeof title === "string" && title.trim()) data.title = title.trim();
    if (description !== undefined)
      data.description = description ? String(description) : null;
    if (priority && PRIORITIES.has(priority)) data.priority = priority;
    if (dueAt === null) data.dueAt = null;
    else if (typeof dueAt === "string")
      data.dueAt = dueAt ? new Date(dueAt) : null;
    if (startAt === null) data.startAt = null;
    else if (typeof startAt === "string")
      data.startAt = startAt ? new Date(startAt) : null;
    if (completed === true && !task.completedAt) data.completedAt = new Date();
    if (completed === false && task.completedAt) data.completedAt = null;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data,
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
    await prisma.taskActivity.create({
      data: {
        taskId,
        actorId: userId,
        type:
          completed === true
            ? "completed"
            : completed === false
              ? "reopened"
              : "updated",
        payloadJson: Object.keys(data),
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
    console.error("PATCH task error:", error);
    return NextResponse.json(
      { error: "فشل تحديث البطاقة" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:delete");
    const userId = Number((session.user as { id?: string | number }).id);
    const { cardId: raw } = await params;
    const taskId = Number(raw);
    if (!Number.isFinite(taskId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const task = await loadTaskOrError(taskId);
    if (!task) return NextResponse.json({ ok: true });
    await requireBoardAccess(task.boardId, userId, "editor");
    await prisma.task.delete({ where: { id: taskId } });
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
    console.error("DELETE task error:", error);
    return NextResponse.json({ error: "فشل حذف البطاقة" }, { status: 500 });
  }
}
