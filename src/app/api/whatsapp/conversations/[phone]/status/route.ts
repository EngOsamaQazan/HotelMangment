import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  normalizeRoutePhone,
  getOrCreateConversationByPhone,
  logConversationEvent,
} from "@/lib/whatsapp/convHelpers";
import { notifyConversationUpdated } from "@/lib/whatsapp/fanout";

interface Ctx {
  params: Promise<{ phone: string }>;
}

const STATUSES = new Set(["open", "resolved", "archived"]);

/**
 * POST /api/whatsapp/conversations/[phone]/status
 * Body: { status: "open" | "resolved" | "archived" }
 *
 * Requires `whatsapp:manage_status`. Inbound messages on a resolved/archived
 * thread automatically flip it back to open (see upsertConversationForInbound).
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:manage_status");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    const status = String(body.status ?? "").trim();
    if (!STATUSES.has(status))
      return NextResponse.json(
        { error: "status يجب أن يكون open أو resolved أو archived" },
        { status: 400 },
      );

    const conv = await getOrCreateConversationByPhone(phone);
    if (!conv)
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 },
      );

    const userId = Number((session.user as { id?: string | number }).id);
    const updated = await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { status },
    });

    await logConversationEvent(conv.id, `status:${status}`, userId, {
      from: conv.status,
    });
    await notifyConversationUpdated({
      conversationId: conv.id,
      contactPhone: phone,
      reason: "status",
      actorUserId: userId,
      extra: { status },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[POST conversations/[phone]/status]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحديث الحالة" },
      { status: 500 },
    );
  }
}
