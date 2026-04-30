import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { normalizeRoutePhone } from "@/lib/whatsapp/convHelpers";

interface Ctx {
  params: Promise<{ phone: string }>;
}

/** GET /api/whatsapp/conversations/[phone] — full conversation details. */
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
    if (!phone)
      return NextResponse.json({ error: "phone مطلوب" }, { status: 400 });

    const conv = await prisma.whatsAppConversation.findUnique({
      where: { contactPhone: phone },
      include: {
        contact: true,
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { id: "desc" },
          take: 1,
          select: {
            id: true,
            direction: true,
            type: true,
            body: true,
            status: true,
            createdAt: true,
            isInternalNote: true,
          },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { author: { select: { id: true, name: true } } },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!conv)
      return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });

    return NextResponse.json(conv);
  } catch (err) {
    console.error("[GET /api/whatsapp/conversations/[phone]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل المحادثة" },
      { status: 500 },
    );
  }
}
