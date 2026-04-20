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
    const { name, wipLimit } = body as { name?: string; wipLimit?: number };
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "اسم العمود مطلوب" },
        { status: 400 },
      );
    }
    const agg = await prisma.taskColumn.aggregate({
      where: { boardId },
      _max: { position: true },
    });
    const column = await prisma.taskColumn.create({
      data: {
        boardId,
        name: name.trim(),
        position: (agg._max.position ?? -1) + 1,
        wipLimit: Number.isFinite(wipLimit) ? Number(wipLimit) : null,
      },
    });
    return NextResponse.json(column, { status: 201 });
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
    console.error("POST columns error:", error);
    return NextResponse.json(
      { error: "فشل إنشاء العمود" },
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
    const { columnId, name, wipLimit } = body as {
      columnId?: number;
      name?: string;
      wipLimit?: number | null;
    };
    if (!Number.isFinite(columnId)) {
      return NextResponse.json(
        { error: "معرف العمود مطلوب" },
        { status: 400 },
      );
    }
    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (wipLimit === null) data.wipLimit = null;
    else if (Number.isFinite(wipLimit)) data.wipLimit = Number(wipLimit);
    const updated = await prisma.taskColumn.update({
      where: { id: Number(columnId) },
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
    console.error("PATCH columns error:", error);
    return NextResponse.json(
      { error: "فشل تحديث العمود" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
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
    await requireBoardAccess(boardId, userId, "editor");
    const { searchParams } = new URL(request.url);
    const columnId = Number(searchParams.get("columnId"));
    const moveTo = Number(searchParams.get("moveTo"));
    if (!Number.isFinite(columnId)) {
      return NextResponse.json(
        { error: "معرف العمود مطلوب" },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      if (Number.isFinite(moveTo)) {
        // Move tasks to another column first
        const agg = await tx.task.aggregate({
          where: { columnId: moveTo },
          _max: { position: true },
        });
        const tasks = await tx.task.findMany({
          where: { columnId },
          orderBy: { position: "asc" },
          select: { id: true },
        });
        const base = (agg._max.position ?? -1) + 1;
        for (let i = 0; i < tasks.length; i++) {
          await tx.task.update({
            where: { id: tasks[i].id },
            data: { columnId: moveTo, position: base + i },
          });
        }
      }
      await tx.taskColumn.delete({ where: { id: columnId } });
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
    console.error("DELETE columns error:", error);
    return NextResponse.json(
      { error: "فشل حذف العمود" },
      { status: 500 },
    );
  }
}
