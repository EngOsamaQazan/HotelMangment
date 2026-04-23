import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { normalizeRoutePhone } from "@/lib/whatsapp/convHelpers";

interface Ctx {
  params: Promise<{ phone: string }>;
}

/** GET /api/whatsapp/conversations/[phone]/events — audit timeline. */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    try {
      await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);

    const conv = await prisma.whatsAppConversation.findUnique({
      where: { contactPhone: phone },
      select: { id: true },
    });
    if (!conv)
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 },
      );

    const events = await prisma.whatsAppConversationEvent.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, name: true } } },
      take: 200,
    });
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[GET conversations/[phone]/events]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل السجل" },
      { status: 500 },
    );
  }
}
