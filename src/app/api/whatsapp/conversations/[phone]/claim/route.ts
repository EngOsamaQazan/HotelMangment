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
 * POST /api/whatsapp/conversations/[phone]/claim
 *
 * Self-assigns an unassigned thread to the caller. Any user with `whatsapp:send`
 * can claim. If the thread is already owned by someone else, returns 409 —
 * use /assign (manager) to steal it.
 */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:send");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);
    if (!phone)
      return NextResponse.json({ error: "phone مطلوب" }, { status: 400 });

    const conv = await getOrCreateConversationByPhone(phone);
    if (!conv)
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 },
      );

    const userId = Number((session.user as { id?: string | number }).id);

    if (conv.assignedToUserId && conv.assignedToUserId !== userId) {
      return NextResponse.json(
        { error: "المحادثة مسندة بالفعل إلى موظف آخر" },
        { status: 409 },
      );
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: {
        assignedToUserId: userId,
        assignedAt: new Date(),
        assignedByUserId: userId,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    await logConversationEvent(conv.id, "claim", userId, null);
    await notifyConversationUpdated({
      conversationId: conv.id,
      contactPhone: phone,
      reason: "claim",
      actorUserId: userId,
      extra: { assignedToUserId: userId },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[POST conversations/[phone]/claim]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر استلام المحادثة" },
      { status: 500 },
    );
  }
}
