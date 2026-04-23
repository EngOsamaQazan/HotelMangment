import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  hasPermission,
  ForbiddenError,
} from "@/lib/permissions/guard";
import { sendText, isWhatsAppApiError } from "@/lib/whatsapp/client";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";
import {
  upsertContact,
  upsertConversationForOutbound,
} from "@/lib/whatsapp/conversations";
import { notifyMessageStatus, notifyConversationUpdated } from "@/lib/whatsapp/fanout";

interface SendBody {
  to?: string;
  text?: string;
  reservationId?: number | null;
  previewUrl?: boolean;
}

/** POST /api/whatsapp/send — send a free-form text message.
 *  Note: outside the 24h customer-service window this requires a template;
 *  use /api/whatsapp/send-template instead. We still attempt the send and
 *  let Meta's error surface naturally if the window is closed.
 *
 *  Enforces the hybrid-assignment rule: if the conversation is assigned to
 *  someone other than the caller, only users with `whatsapp:assign` (managers)
 *  may still reply. */
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

    const body = (await req.json()) as SendBody;
    const text = String(body.text ?? "").trim();
    const to = normalizeWhatsAppPhone(body.to ?? "");

    if (!to)
      return NextResponse.json({ error: "رقم هاتف غير صالح" }, { status: 400 });
    if (!text)
      return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 });
    if (text.length > 4096) {
      return NextResponse.json(
        { error: "نص الرسالة أطول من الحد الأقصى (4096 حرفًا)." },
        { status: 400 },
      );
    }

    const userId = Number((session.user as { id?: string | number }).id);

    // Enforce hybrid assignment: if the thread is assigned to someone else,
    // only managers (whatsapp:assign) may override and reply.
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

    // Ensure contact + conversation exist so outbound rows always link cleanly.
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

    // Optimistic log — then patch with Meta's wamid on success.
    const row = await prisma.whatsAppMessage.create({
      data: {
        direction: "outbound",
        contactPhone: to,
        type: "text",
        body: text,
        status: "queued",
        reservationId: body.reservationId ?? null,
        sentByUserId: Number.isFinite(userId) ? userId : null,
        conversationId: conversation.id,
      },
    });

    try {
      const resp = await sendText({ to, text, previewUrl: !!body.previewUrl });
      const wamid = resp.messages?.[0]?.id ?? null;
      await prisma.whatsAppMessage.update({
        where: { id: row.id },
        data: {
          wamid,
          status: "sent",
          sentAt: new Date(),
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
      return NextResponse.json({ ok: true, id: row.id, wamid }, { status: 201 });
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
    console.error("[POST /api/whatsapp/send]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر الإرسال" },
      { status: 500 },
    );
  }
}
