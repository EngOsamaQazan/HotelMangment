import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { markMessageRead } from "@/lib/whatsapp/client";
import { notifyConversationUpdated } from "@/lib/whatsapp/fanout";

/**
 * POST /api/whatsapp/messages/read
 * Body: { contact: "962797707062" }
 *
 * Marks every inbound message from {contact} whose status is "received"
 * as "read" locally, and best-effort sends the read receipt to Meta so
 * the sender sees two blue ticks in WhatsApp.
 */
export async function POST(req: Request) {
  try {
    try {
      await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json().catch(() => ({}))) as { contact?: string };
    const contact = String(body.contact ?? "")
      .replace(/\D/g, "")
      .trim();
    if (!contact) {
      return NextResponse.json({ error: "contact مطلوب" }, { status: 400 });
    }

    const toMark = await prisma.whatsAppMessage.findMany({
      where: {
        contactPhone: contact,
        direction: "inbound",
        status: "received",
      },
      select: { id: true, wamid: true },
    });

    if (toMark.length === 0) {
      return NextResponse.json({ ok: true, marked: 0 });
    }

    const now = new Date();
    await prisma.whatsAppMessage.updateMany({
      where: { id: { in: toMark.map((m) => m.id) } },
      data: { status: "read", readAt: now },
    });

    // Clear the conversation unread counter + remember who read it when.
    const conv = await prisma.whatsAppConversation.findUnique({
      where: { contactPhone: contact },
      select: { id: true },
    });
    if (conv) {
      await prisma.whatsAppConversation.update({
        where: { id: conv.id },
        data: { unreadCount: 0, lastReadByAssigneeAt: now },
      });
      await notifyConversationUpdated({
        conversationId: conv.id,
        contactPhone: contact,
        reason: "read",
        extra: { unreadCount: 0 },
      });
    }

    // Best-effort read-receipts to Meta. Only the LATEST message needs the
    // receipt — WhatsApp marks all earlier ones as read once a later one is
    // acknowledged. We still iterate in case the newest wamid was stripped.
    const withWamid = toMark.filter((m) => !!m.wamid);
    const newest = withWamid[withWamid.length - 1];
    if (newest?.wamid) {
      markMessageRead(newest.wamid).catch((err) =>
        console.warn("[whatsapp/read] Meta receipt failed (non-fatal):", err),
      );
    }

    return NextResponse.json({ ok: true, marked: toMark.length });
  } catch (err) {
    console.error("[POST /api/whatsapp/messages/read]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تعليم الرسائل كمقروءة" },
      { status: 500 },
    );
  }
}
