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
 * File server for attachments + public hotel imagery. Path convention:
 *
 *   /api/files/task/<attachmentId>           (staff-only, board members)
 *   /api/files/chat/<attachmentId>           (staff-only, conversation members)
 *   /api/files/avatar/<userId>               (staff-only)
 *   /api/files/unit-photo/<photoId>          (PUBLIC — no auth, CDN-friendly)
 *   /api/files/unit-type-photo/<photoId>     (PUBLIC — no auth, CDN-friendly)
 *
 * Public kinds are required for the guest-facing `/book` pages to render
 * without a session. All remote traversal protection still applies via
 * `resolveStoragePath`.
 */

const PUBLIC_KINDS = new Set(["unit-photo", "unit-type-photo"]);

function mimeFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    default:
      return "image/jpeg";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path: segments } = await params;
    if (!segments || segments.length < 2) {
      return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
    }
    const [kind, rawId] = segments;
    const isPublic = PUBLIC_KINDS.has(kind);

    // Staff-only kinds require a permission check up front. Public kinds
    // (unit photos) are served to anonymous visitors.
    const session = isPublic ? null : await requirePermission("files:view");
    const userId = session
      ? Number((session.user as { id?: string | number }).id)
      : 0;

    const rowId = Number(rawId);
    if (!Number.isFinite(rowId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }

    let storagePath: string;
    let fileName: string;
    let mimeType: string;
    let cacheControl = "private, max-age=3600";

    if (kind === "task") {
      const att = await prisma.taskAttachment.findUnique({
        where: { id: rowId },
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
        where: { id: rowId },
        select: { avatarUrl: true },
      });
      if (!user || !user.avatarUrl) {
        return NextResponse.json(
          { error: "لا توجد صورة لهذا المستخدم" },
          { status: 404 },
        );
      }
      storagePath = user.avatarUrl;
      fileName = `avatar-${rowId}`;
      mimeType = mimeFromPath(storagePath);
    } else if (kind === "chat") {
      const att = await prisma.chatMessageAttachment.findUnique({
        where: { id: rowId },
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
    } else if (kind === "unit-photo") {
      const photo = await prisma.unitPhoto.findUnique({
        where: { id: rowId },
        select: { url: true },
      });
      if (!photo) {
        return NextResponse.json({ error: "الصورة غير موجودة" }, { status: 404 });
      }
      if (/^https?:\/\//i.test(photo.url)) {
        return NextResponse.redirect(photo.url, 307);
      }
      storagePath = photo.url.replace(/^stored:/, "");
      fileName = `unit-${rowId}.${storagePath.split(".").pop() ?? "jpg"}`;
      mimeType = mimeFromPath(storagePath);
      cacheControl = "public, max-age=86400, s-maxage=604800";
    } else if (kind === "unit-type-photo") {
      const photo = await prisma.unitTypePhoto.findUnique({
        where: { id: rowId },
        select: { url: true },
      });
      if (!photo) {
        return NextResponse.json({ error: "الصورة غير موجودة" }, { status: 404 });
      }
      if (/^https?:\/\//i.test(photo.url)) {
        return NextResponse.redirect(photo.url, 307);
      }
      storagePath = photo.url.replace(/^stored:/, "");
      fileName = `unit-type-${rowId}.${storagePath.split(".").pop() ?? "jpg"}`;
      mimeType = mimeFromPath(storagePath);
      cacheControl = "public, max-age=86400, s-maxage=604800";
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
        "Cache-Control": cacheControl,
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
