import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError, hasPermission } from "@/lib/permissions/guard";
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
 * POST /api/whatsapp/conversations/[phone]/unassign
 *
 * Removes the current assignee. Permitted for the current assignee (release
 * themselves) or for managers with `whatsapp:assign`.
 */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:send", "whatsapp:assign");
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
    const isAssignee = conv.assignedToUserId === userId;
    const isManager = await hasPermission(userId, "whatsapp:assign");
    if (!isAssignee && !isManager) {
      return NextResponse.json(
        { error: "لا يمكنك إلغاء إسناد محادثة موظف آخر" },
        { status: 403 },
      );
    }

    const updated = await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: {
        assignedToUserId: null,
        assignedAt: null,
        assignedByUserId: null,
      },
    });

    await logConversationEvent(conv.id, "unassign", userId, null);
    await notifyConversationUpdated({
      conversationId: conv.id,
      contactPhone: phone,
      reason: "unassign",
      actorUserId: userId,
      extra: { assignedToUserId: null },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[POST conversations/[phone]/unassign]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر إلغاء إسناد المحادثة" },
      { status: 500 },
    );
  }
}
