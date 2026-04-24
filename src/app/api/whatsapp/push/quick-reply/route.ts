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
import {
  notifyMessageStatus,
  notifyConversationUpdated,
} from "@/lib/whatsapp/fanout";

interface QuickReplyBody {
  to?: string;
  conversationId?: number;
  text?: string;
}

/**
 * POST /api/whatsapp/push/quick-reply
 *
 * Invoked by the Service Worker when the user submits the inline text
 * input on an Android Chrome WhatsApp push notification (quick reply).
 * Mirrors `/api/whatsapp/send` but is intentionally kept minimal and
 * credentialled via the SW's same-origin cookies so it works without
 * opening the PWA.
 *
 * We reuse the caller's session: the user must hold `whatsapp:send` and
 * must be allowed on this specific conversation per the hybrid-assignment
 * rule (only the assignee or a manager may reply).
 */
export async function POST(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:send");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json().catch(() => ({}))) as QuickReplyBody;
    const text = String(body.text ?? "").trim();
    const to = normalizeWhatsAppPhone(body.to ?? "");

    if (!to)
      return NextResponse.json({ error: "رقم هاتف غير صالح" }, { status: 400 });
    if (!text)
      return NextResponse.json({ error: "نص الردّ فارغ" }, { status: 400 });
    if (text.length > 4096) {
      return NextResponse.json(
        { error: "الردّ أطول من الحدّ المسموح" },
        { status: 400 },
      );
    }

    const userId = Number((session.user as { id?: string | number }).id);

    // Enforce hybrid assignment — match `/api/whatsapp/send` semantics.
    const existingConv = await prisma.whatsAppConversation.findUnique({
      where: { contactPhone: to },
      select: { assignedToUserId: true, id: true },
    });
    if (
      existingConv?.assignedToUserId &&
      existingConv.assignedToUserId !== userId &&
      !(await hasPermission(userId, "whatsapp:assign"))
    ) {
      throw new ForbiddenError(
        "المحادثة مسندة لموظّف آخر — افتح التطبيق لإعادة الإسناد.",
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

    const row = await prisma.whatsAppMessage.create({
      data: {
        direction: "outbound",
        contactPhone: to,
        type: "text",
        body: text,
        status: "queued",
        sentByUserId: Number.isFinite(userId) ? userId : null,
        conversationId: conversation.id,
      },
    });

    try {
      const resp = await sendText({ to, text, previewUrl: false });
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
        reason: "new_outbound_quick_reply",
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
      return NextResponse.json(
        {
          error: apiErr?.message ?? (err as Error).message ?? "تعذّر الإرسال",
          id: row.id,
        },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    console.error("[POST /api/whatsapp/push/quick-reply]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر إرسال الردّ" },
      { status: 500 },
    );
  }
}
