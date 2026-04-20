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
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.boards:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { boardId: raw } = await params;
    const boardId = Number(raw);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireBoardAccess(boardId, userId, "viewer");

    const board = await prisma.taskBoard.findUnique({
      where: { id: boardId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        columns: { orderBy: { position: "asc" } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        labels: { orderBy: { id: "asc" } },
        tasks: {
          where: { archivedAt: null },
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
            checklist: {
              select: { id: true, done: true },
            },
          },
          orderBy: [{ columnId: "asc" }, { position: "asc" }],
        },
      },
    });
    if (!board) {
      return NextResponse.json(
        { error: "لم يُعثر على اللوحة" },
        { status: 404 },
      );
    }
    return NextResponse.json(board);
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
    console.error("GET /api/tasks/boards/[boardId] error:", error);
    return NextResponse.json(
      { error: "فشل تحميل اللوحة" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.boards:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { boardId: raw } = await params;
    const boardId = Number(raw);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireBoardAccess(boardId, userId, "editor");

    const body = await request.json().catch(() => ({}));
    const { name, description, color, archived } = body as {
      name?: string;
      description?: string | null;
      color?: string | null;
      archived?: boolean;
    };
    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (description !== undefined) data.description = description || null;
    if (color !== undefined) data.color = color || null;
    if (archived === true) data.archivedAt = new Date();
    if (archived === false) data.archivedAt = null;

    const updated = await prisma.taskBoard.update({
      where: { id: boardId },
      data,
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
    console.error("PATCH /api/tasks/boards/[boardId] error:", error);
    return NextResponse.json(
      { error: "فشل تحديث اللوحة" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.boards:delete");
    const userId = Number((session.user as { id?: string | number }).id);
    const { boardId: raw } = await params;
    const boardId = Number(raw);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const access = await requireBoardAccess(boardId, userId, "owner");
    if (!access.isOwner) {
      return NextResponse.json(
        { error: "المالك وحده يستطيع حذف اللوحة" },
        { status: 403 },
      );
    }
    await prisma.taskBoard.delete({ where: { id: boardId } });
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
    console.error("DELETE /api/tasks/boards/[boardId] error:", error);
    return NextResponse.json(
      { error: "فشل حذف اللوحة" },
      { status: 500 },
    );
  }
}
