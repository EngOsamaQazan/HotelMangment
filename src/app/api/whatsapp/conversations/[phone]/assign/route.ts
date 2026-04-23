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

/**
 * POST /api/whatsapp/conversations/[phone]/assign
 * Body: { userId: number }
 *
 * Manager-only: requires `whatsapp:assign`. Any employee can view the thread
 * but only the assignee + managers may send replies (enforced in /send).
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:assign");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);
    if (!phone)
      return NextResponse.json({ error: "phone مطلوب" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { userId?: number };
    const userId = Number(body.userId);
    if (!Number.isFinite(userId))
      return NextResponse.json(
        { error: "userId غير صالح" },
        { status: 400 },
      );

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "المستخدم غير موجود" },
        { status: 400 },
      );
    }

    const conv = await getOrCreateConversationByPhone(phone);
    if (!conv)
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 },
      );

    const actorUserId = Number((session.user as { id?: string | number }).id);
    const now = new Date();
    const updated = await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: {
        assignedToUserId: userId,
        assignedAt: now,
        assignedByUserId: actorUserId,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    await logConversationEvent(conv.id, "assign", actorUserId, {
      toUserId: userId,
      toUserName: target.name,
    });

    await notifyConversationUpdated({
      conversationId: conv.id,
      contactPhone: phone,
      reason: "assign",
      actorUserId,
      extra: { assignedToUserId: userId, targetUserIds: [userId] },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[POST conversations/[phone]/assign]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر إسناد المحادثة" },
      { status: 500 },
    );
  }
}
