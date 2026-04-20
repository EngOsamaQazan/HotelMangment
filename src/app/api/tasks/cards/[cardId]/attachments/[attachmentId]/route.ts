import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";
import { deleteStoredFile } from "@/lib/uploads";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string; attachmentId: string }> },
) {
  try {
    const session = await requirePermission("tasks.cards:edit");
    const userId = Number((session.user as { id?: string | number }).id);
    const { attachmentId: raw } = await params;
    const attachmentId = Number(raw);
    if (!Number.isFinite(attachmentId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const att = await prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      include: { task: { select: { boardId: true } } },
    });
    if (!att) return NextResponse.json({ ok: true });
    await requireBoardAccess(att.task.boardId, userId, "editor");
    await prisma.taskAttachment.delete({ where: { id: attachmentId } });
    await deleteStoredFile(att.storagePath);
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
    console.error("DELETE attachment error:", error);
    return NextResponse.json({ error: "فشل حذف المرفق" }, { status: 500 });
  }
}
