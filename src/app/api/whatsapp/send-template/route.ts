import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { sendTemplate, isWhatsAppApiError } from "@/lib/whatsapp/client";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";
import {
  upsertContact,
  upsertConversationForOutbound,
} from "@/lib/whatsapp/conversations";
import { notifyMessageStatus, notifyConversationUpdated } from "@/lib/whatsapp/fanout";

interface SendTemplateBody {
  to?: string;
  templateName?: string;
  language?: string;
  components?: unknown[];
  reservationId?: number | null;
}

/** POST /api/whatsapp/send-template — send an approved message template. */
export async function POST(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:send_template");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json()) as SendTemplateBody;
    const to = normalizeWhatsAppPhone(body.to ?? "");
    const templateName = String(body.templateName ?? "").trim();
    const language = (body.language ?? "ar").trim() || "ar";

    if (!to)
      return NextResponse.json({ error: "رقم هاتف غير صالح" }, { status: 400 });
    if (!templateName)
      return NextResponse.json({ error: "اسم القالب مطلوب" }, { status: 400 });

    const userId = Number((session.user as { id?: string | number }).id);

    const contact = await upsertContact({
      phone: to,
      optedIn: true,
      updatedByUserId: Number.isFinite(userId) ? userId : null,
    });
    const conversation = await upsertConversationForOutbound(
      to,
      new Date(),
      contact.id,
      Number.isFinite(userId) ? userId : null,
    );

    const row = await prisma.whatsAppMessage.create({
      data: {
        direction: "outbound",
        contactPhone: to,
        type: "template",
        templateName,
        body: null,
        status: "queued",
        reservationId: body.reservationId ?? null,
        sentByUserId: Number.isFinite(userId) ? userId : null,
        conversationId: conversation.id,
      },
    });

    try {
      const resp = await sendTemplate({
        to,
        templateName,
        language,
        components: Array.isArray(body.components) ? body.components : undefined,
      });
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
      const message = apiErr?.message ?? (err as Error).message ?? "تعذّر إرسال القالب";
      return NextResponse.json(
        { error: message, code: apiErr?.code, id: row.id },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    console.error("[POST /api/whatsapp/send-template]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر إرسال القالب" },
      { status: 500 },
    );
  }
}
