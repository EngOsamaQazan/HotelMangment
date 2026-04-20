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
    const { columnIds } = body as { columnIds?: number[] };
    if (!Array.isArray(columnIds) || !columnIds.length) {
      return NextResponse.json(
        { error: "ترتيب الأعمدة مطلوب" },
        { status: 400 },
      );
    }
    const ids = columnIds.map(Number).filter(Number.isFinite);
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx.taskColumn.updateMany({
          where: { id: ids[i], boardId },
          data: { position: i },
        });
      }
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
    console.error("POST columns/reorder error:", error);
    return NextResponse.json(
      { error: "فشل إعادة ترتيب الأعمدة" },
      { status: 500 },
    );
  }
}
