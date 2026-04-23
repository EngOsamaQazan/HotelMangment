import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  normalizeRoutePhone,
  getOrCreateConversationByPhone,
} from "@/lib/whatsapp/convHelpers";
import { notifyConversationUpdated } from "@/lib/whatsapp/fanout";

interface Ctx {
  params: Promise<{ phone: string }>;
}

/**
 * GET  /api/whatsapp/conversations/[phone]/notes   — list internal notes.
 * POST /api/whatsapp/conversations/[phone]/notes   — add one.
 *
 * Internal notes are visible to any employee with `whatsapp:view` but NEVER
 * sent to the customer. Creating one requires `whatsapp:notes`.
 */
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

    const notes = await prisma.whatsAppConversationNote.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true } } },
      take: 200,
    });
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("[GET conversations/[phone]/notes]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل الملاحظات" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:notes");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);
    const body = (await req.json().catch(() => ({}))) as { body?: string };
    const text = String(body.body ?? "").trim();
    if (!text)
      return NextResponse.json({ error: "نص الملاحظة مطلوب" }, { status: 400 });

    const conv = await getOrCreateConversationByPhone(phone);
    if (!conv)
      return NextResponse.json(
        { error: "المحادثة غير موجودة" },
        { status: 404 },
      );

    const userId = Number((session.user as { id?: string | number }).id);
    const note = await prisma.whatsAppConversationNote.create({
      data: {
        conversationId: conv.id,
        authorUserId: userId,
        body: text,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    await notifyConversationUpdated({
      conversationId: conv.id,
      contactPhone: phone,
      reason: "note",
      actorUserId: userId,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    console.error("[POST conversations/[phone]/notes]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر إضافة الملاحظة" },
      { status: 500 },
    );
  }
}
