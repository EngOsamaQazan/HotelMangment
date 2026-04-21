import { NextResponse } from "next/server";
import fs from "fs/promises";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  ForbiddenError,
} from "@/lib/permissions/guard";
import { resolveStoragePath } from "@/lib/uploads";

/**
 * Authenticated file server for attachments. Path convention:
 *
 *   /api/files/task/<attachmentId>
 *   /api/files/chat/<attachmentId>
 *
 * The caller must either be a board member (task attachments) or a
 * conversation participant (chat attachments).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const session = await requirePermission("files:view");
    const { path: segments } = await params;
    if (!segments || segments.length < 2) {
      return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
    }
    const [kind, rawId] = segments;
    const attachmentId = Number(rawId);
    if (!Number.isFinite(attachmentId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const userId = Number(
      (session.user as { id?: string | number }).id,
    );

    let storagePath: string;
    let fileName: string;
    let mimeType: string;

    if (kind === "task") {
      const att = await prisma.taskAttachment.findUnique({
        where: { id: attachmentId },
        include: { task: { include: { board: true } } },
      });
      if (!att) {
        return NextResponse.json(
          { error: "لم يُعثر على المرفق" },
          { status: 404 },
        );
      }
      const member = await prisma.taskBoardMember.findUnique({
        where: {
          boardId_userId: { boardId: att.task.boardId, userId },
        },
      });
      if (!member && att.task.board.ownerId !== userId) {
        throw new ForbiddenError("لست عضواً في هذه اللوحة");
      }
      storagePath = att.storagePath;
      fileName = att.fileName;
      mimeType = att.mimeType;
    } else if (kind === "avatar") {
      const user = await prisma.user.findUnique({
        where: { id: attachmentId },
        select: { avatarUrl: true, name: true },
      });
      if (!user || !user.avatarUrl) {
        return NextResponse.json(
          { error: "لا توجد صورة لهذا المستخدم" },
          { status: 404 },
        );
      }
      storagePath = user.avatarUrl;
      fileName = `avatar-${attachmentId}`;
      // MIME is recorded neither here nor in `avatarUrl`; infer from extension.
      const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
      mimeType =
        ext === "png"
          ? "image/png"
          : ext === "gif"
            ? "image/gif"
            : ext === "webp"
              ? "image/webp"
              : ext === "svg"
                ? "image/svg+xml"
                : "image/jpeg";
    } else if (kind === "chat") {
      const att = await prisma.chatMessageAttachment.findUnique({
        where: { id: attachmentId },
        include: { message: true },
      });
      if (!att) {
        return NextResponse.json(
          { error: "لم يُعثر على المرفق" },
          { status: 404 },
        );
      }
      const part = await prisma.chatParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: att.message.conversationId,
            userId,
          },
        },
      });
      if (!part || part.leftAt) {
        throw new ForbiddenError("لست عضواً في هذه المحادثة");
      }
      storagePath = att.storagePath;
      fileName = att.fileName;
      mimeType = att.mimeType;
    } else {
      return NextResponse.json(
        { error: "نوع المرفق غير مدعوم" },
        { status: 400 },
      );
    }

    const abs = resolveStoragePath(storagePath);
    const buf = await fs.readFile(abs);
    const body = new Uint8Array(buf);
    const encoded = encodeURIComponent(fileName);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": mimeType || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/files/[...path] error:", error);
    return NextResponse.json(
      { error: "فشل تحميل الملف" },
      { status: 500 },
    );
  }
}
