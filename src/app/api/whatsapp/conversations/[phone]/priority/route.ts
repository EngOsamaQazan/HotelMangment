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

const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

/**
 * POST /api/whatsapp/conversations/[phone]/priority
 * Body: { priority: "low" | "normal" | "high" | "urgent" }
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
    const body = (await req.json().catch(() => ({}))) as { priority?: string };
    const priority = String(body.priority ?? "").trim();
    if (!PRIORITIES.has(priority))
      return NextResponse.json({ error: "priority غير صالح" }, { status: 400 });

    const conv = await getOrCreateConversationByPhone(phone);
    if (!conv)
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 },
      );

    const userId = Number((session.user as { id?: string | number }).id);
    const updated = await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { priority },
    });

    await logConversationEvent(conv.id, `priority:${priority}`, userId, {
      from: conv.priority,
    });
    await notifyConversationUpdated({
      conversationId: conv.id,
      contactPhone: phone,
      reason: "priority",
      actorUserId: userId,
      extra: { priority },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[POST conversations/[phone]/priority]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحديث الأولوية" },
      { status: 500 },
    );
  }
}
