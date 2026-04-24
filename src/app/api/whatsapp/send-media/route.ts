import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  hasPermission,
  ForbiddenError,
} from "@/lib/permissions/guard";
import {
  uploadMedia,
  sendMedia,
  isWhatsAppApiError,
  type SendMediaKind,
} from "@/lib/whatsapp/client";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";
import {
  upsertContact,
  upsertConversationForOutbound,
} from "@/lib/whatsapp/conversations";
import {
  notifyMessageStatus,
  notifyConversationUpdated,
} from "@/lib/whatsapp/fanout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/whatsapp/send-media (multipart/form-data)
 *   Fields:
 *     to       — E.164 phone digits (no +)
 *     kind     — "image" | "document" | "video" | "audio"
 *     caption  — optional plain text (<= 1024 chars)
 *     file     — the binary Blob
 *
 * Enforces the same hybrid-assignment rule as /send: if the conversation
 * belongs to another agent, only users with `whatsapp:assign` may override.
 *
 * On success: 201 { id, wamid, mediaId, mediaMimeType }.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — Meta caps images at 5MB
const MAX_DOC_BYTES = 100 * 1024 * 1024; // 100MB for documents
const MAX_VIDEO_BYTES = 16 * 1024 * 1024; // 16MB for video/MP4
const MAX_AUDIO_BYTES = 16 * 1024 * 1024; // 16MB for audio

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_AUDIO_MIME = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/3gpp"]);
// Documents are permissive — Meta accepts most mime types.

export async function POST(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:send", "whatsapp:create");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const ct = req.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "الطلب يجب أن يكون multipart/form-data" },
        { status: 400 },
      );
    }

    const form = await req.formData();
    const to = normalizeWhatsAppPhone(String(form.get("to") ?? ""));
    const kindRaw = String(form.get("kind") ?? "image").toLowerCase();
    const caption = String(form.get("caption") ?? "").trim();
    const file = form.get("file");

    if (!to) {
      return NextResponse.json({ error: "رقم هاتف غير صالح" }, { status: 400 });
    }
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "الملف مطلوب" }, { status: 400 });
    }
    if (!["image", "document", "video", "audio"].includes(kindRaw)) {
      return NextResponse.json({ error: "نوع الملف غير مدعوم" }, { status: 400 });
    }
    const kind = kindRaw as SendMediaKind;
    if (caption.length > 1024) {
      return NextResponse.json(
        { error: "التعليق طويل (حد أقصى 1024 حرفًا)" },
        { status: 400 },
      );
    }

    // Size & mime guards.
    const size = file.size;
    const mime = file.type || "application/octet-stream";
    const filename =
      (file as File).name ||
      (kind === "image"
        ? "image.jpg"
        : kind === "video"
          ? "video.mp4"
          : kind === "audio"
            ? "audio.ogg"
            : "file.bin");

    if (kind === "image") {
      if (!ALLOWED_IMAGE_MIME.has(mime)) {
        return NextResponse.json(
          { error: "الصور المدعومة: JPG / PNG / WebP فقط" },
          { status: 400 },
        );
      }
      if (size > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "حجم الصورة يتجاوز 5MB" },
          { status: 400 },
        );
      }
    } else if (kind === "video") {
      if (!ALLOWED_VIDEO_MIME.has(mime)) {
        return NextResponse.json(
          { error: "يُدعم MP4 و 3GPP فقط" },
          { status: 400 },
        );
      }
      if (size > MAX_VIDEO_BYTES) {
        return NextResponse.json(
          { error: "حجم الفيديو يتجاوز 16MB" },
          { status: 400 },
        );
      }
    } else if (kind === "audio") {
      if (!ALLOWED_AUDIO_MIME.has(mime)) {
        return NextResponse.json(
          { error: "يُدعم AAC / MP4 / MPEG / AMR / OGG (OPUS) فقط" },
          { status: 400 },
        );
      }
      if (size > MAX_AUDIO_BYTES) {
        return NextResponse.json(
          { error: "حجم الملف الصوتي يتجاوز 16MB" },
          { status: 400 },
        );
      }
    } else {
      // document
      if (size > MAX_DOC_BYTES) {
        return NextResponse.json(
          { error: "حجم المستند يتجاوز 100MB" },
          { status: 400 },
        );
      }
    }

    const userId = Number((session.user as { id?: string | number }).id);

    // Hybrid assignment guard.
    const existingConv = await prisma.whatsAppConversation.findUnique({
      where: { contactPhone: to },
      select: { assignedToUserId: true },
    });
    if (
      existingConv?.assignedToUserId &&
      existingConv.assignedToUserId !== userId &&
      !(await hasPermission(userId, "whatsapp:assign"))
    ) {
      throw new ForbiddenError(
        "هذه المحادثة مسندة إلى موظف آخر. اطلب من المسؤول إعادة إسنادها أو تفعيل صلاحية «إسناد المحادثات».",
      );
    }

    const contact = await upsertContact({
      phone: to,
      source: existingConv ? undefined : "whatsapp",
      optedIn: true,
      updatedByUserId: Number.isFinite(userId) ? userId : null,
    });
    const conversation = await upsertConversationForOutbound(
      to,
      new Date(),
      contact.id,
      Number.isFinite(userId) ? userId : null,
    );

    const bytes = Buffer.from(await file.arrayBuffer());

    // Optimistic row so the UI can show an "uploading" bubble immediately.
    const row = await prisma.whatsAppMessage.create({
      data: {
        direction: "outbound",
        contactPhone: to,
        type: kind,
        body: caption || null,
        status: "queued",
        sentByUserId: Number.isFinite(userId) ? userId : null,
        conversationId: conversation.id,
        mediaMimeType: mime,
        mediaFilename: filename,
        mediaSize: size,
      },
    });

    try {
      const uploaded = await uploadMedia({ bytes, mimeType: mime, filename });
      const resp = await sendMedia({
        to,
        kind,
        mediaId: uploaded.id,
        caption: caption || undefined,
        filename: kind === "document" ? filename : undefined,
      });
      const wamid = resp.messages?.[0]?.id ?? null;
      await prisma.whatsAppMessage.update({
        where: { id: row.id },
        data: {
          wamid,
          status: "sent",
          sentAt: new Date(),
          mediaId: uploaded.id,
          rawJson: resp as unknown as Prisma.InputJsonValue,
        },
      });
      await notifyMessageStatus({
        messageId: row.id,
        conversationId: conversation.id,
        contactPhone: to,
        status: "sent",
      });
      await notifyConversationUpdated({
        conversationId: conversation.id,
        contactPhone: to,
        reason: "new_outbound",
        actorUserId: Number.isFinite(userId) ? userId : null,
      });
      return NextResponse.json(
        {
          ok: true,
          id: row.id,
          wamid,
          mediaId: uploaded.id,
          mediaMimeType: mime,
        },
        { status: 201 },
      );
    } catch (err) {
      const apiErr = isWhatsAppApiError(err) ? err : null;
      await prisma.whatsAppMessage.update({
        where: { id: row.id },
        data: {
          status: "failed",
          errorCode: apiErr?.code ? String(apiErr.code) : null,
          errorMessage: apiErr?.message ?? (err as Error).message,
        },
      });
      await notifyMessageStatus({
        messageId: row.id,
        conversationId: conversation.id,
        contactPhone: to,
        status: "failed",
        errorCode: apiErr?.code ? String(apiErr.code) : null,
        errorMessage: apiErr?.message ?? (err as Error).message,
      });
      const message = apiErr?.message ?? (err as Error).message ?? "تعذّر الإرسال";
      return NextResponse.json(
        { error: message, code: apiErr?.code, id: row.id },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    console.error("[POST /api/whatsapp/send-media]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر الإرسال" },
      { status: 500 },
    );
  }
}
