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
    const { name, color } = body as { name?: string; color?: string };
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "اسم التسمية مطلوب" }, { status: 400 });
    }
    const label = await prisma.taskLabel.create({
      data: {
        boardId,
        name: name.trim(),
        color: color || "#6b7280",
      },
    });
    return NextResponse.json(label, { status: 201 });
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
    console.error("POST labels error:", error);
    return NextResponse.json({ error: "فشل إنشاء التسمية" }, { status: 500 });
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
    const { labelId, name, color } = body as {
      labelId?: number;
      name?: string;
      color?: string;
    };
    if (!Number.isFinite(labelId)) {
      return NextResponse.json({ error: "معرف التسمية مطلوب" }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof color === "string") data.color = color;
    const updated = await prisma.taskLabel.update({
      where: { id: Number(labelId) },
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
    console.error("PATCH labels error:", error);
    return NextResponse.json({ error: "فشل تحديث التسمية" }, { status: 500 });
  }
}

export async function DELETE(
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
    const { searchParams } = new URL(request.url);
    const labelId = Number(searchParams.get("labelId"));
    if (!Number.isFinite(labelId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await prisma.taskLabel.delete({ where: { id: labelId } });
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
    console.error("DELETE labels error:", error);
    return NextResponse.json({ error: "فشل حذف التسمية" }, { status: 500 });
  }
}
