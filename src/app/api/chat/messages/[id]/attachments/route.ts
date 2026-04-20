import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireConversationAccess } from "@/lib/tasks/access";
import { saveFormFile, UploadError } from "@/lib/uploads";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("chat:create");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id: raw } = await params;
    const messageId = Number(raw);
    if (!Number.isFinite(messageId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true, senderId: true },
    });
    if (!msg) {
      return NextResponse.json(
        { error: "لم يُعثر على الرسالة" },
        { status: 404 },
      );
    }
    if (msg.senderId !== userId) {
      return NextResponse.json(
        { error: "لا يمكنك إضافة مرفق لرسالة غيرك" },
        { status: 403 },
      );
    }
    await requireConversationAccess(msg.conversationId, userId);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "لم يُرفق أي ملف" },
        { status: 400 },
      );
    }
    const saved = await saveFormFile(file);
    const att = await prisma.chatMessageAttachment.create({
      data: {
        messageId,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        size: saved.size,
        storagePath: saved.storagePath,
        uploadedById: userId,
      },
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
    console.error("POST chat attachment error:", error);
    return NextResponse.json({ error: "فشل رفع الملف" }, { status: 500 });
  }
}
