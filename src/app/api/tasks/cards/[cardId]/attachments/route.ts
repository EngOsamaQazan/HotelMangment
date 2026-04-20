import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";
import { saveFormFile, UploadError } from "@/lib/uploads";

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
    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(attachments);
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
    console.error("GET attachments error:", error);
    return NextResponse.json({ error: "فشل تحميل المرفقات" }, { status: 500 });
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
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json(
        { error: "لم يُعثر على البطاقة" },
        { status: 404 },
      );
    }
    await requireBoardAccess(task.boardId, userId, "editor");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "لم يُرفق أي ملف" },
        { status: 400 },
      );
    }
    const saved = await saveFormFile(file);
    const att = await prisma.$transaction(async (tx) => {
      const a = await tx.taskAttachment.create({
        data: {
          taskId,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          size: saved.size,
          storagePath: saved.storagePath,
          uploadedById: userId,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      await tx.taskActivity.create({
        data: {
          taskId,
          actorId: userId,
          type: "attachment",
          payloadJson: { attachmentId: a.id, fileName: a.fileName },
        },
      });
      return a;
    });
    return NextResponse.json(att, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const status = errStatus(error);
    if (status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    console.error("POST attachment error:", error);
    return NextResponse.json({ error: "فشل رفع الملف" }, { status: 500 });
  }
}
