import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

async function resolveBoardId(itemId: number): Promise<number | null> {
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { task: { select: { boardId: true } } },
  });
  return item?.task.boardId ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ cardId: string; itemId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { itemId: raw } = await params;
    const itemId = Number(raw);
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const boardId = await resolveBoardId(itemId);
    if (!boardId) {
      return NextResponse.json(
        { error: "لم يُعثر على العنصر" },
        { status: 404 },
      );
    }
    await requireBoardAccess(boardId, userId, "editor");
    const body = await request.json().catch(() => ({}));
    const { text, done } = body as { text?: string; done?: boolean };
    const data: Record<string, unknown> = {};
    if (typeof text === "string" && text.trim()) data.text = text.trim();
    if (typeof done === "boolean") data.done = done;
    const updated = await prisma.taskChecklistItem.update({
      where: { id: itemId },
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
    console.error("PATCH checklist item error:", error);
    return NextResponse.json({ error: "فشل التحديث" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string; itemId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { itemId: raw } = await params;
    const itemId = Number(raw);
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const boardId = await resolveBoardId(itemId);
    if (!boardId) return NextResponse.json({ ok: true });
    await requireBoardAccess(boardId, userId, "editor");
    await prisma.taskChecklistItem.delete({ where: { id: itemId } });
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
    console.error("DELETE checklist item error:", error);
    return NextResponse.json({ error: "فشل الحذف" }, { status: 500 });
  }
}
