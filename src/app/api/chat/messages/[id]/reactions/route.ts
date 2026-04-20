import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireConversationAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("chat:create");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id: raw } = await params;
    const messageId = Number(raw);
    if (!Number.isFinite(messageId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    if (!msg) {
      return NextResponse.json(
        { error: "لم يُعثر على الرسالة" },
        { status: 404 },
      );
    }
    await requireConversationAccess(msg.conversationId, userId);
    const body = await request.json().catch(() => ({}));
    const { emoji } = body as { emoji?: string };
    if (!emoji || !emoji.trim() || emoji.length > 16) {
      return NextResponse.json({ error: "إيموجي غير صالح" }, { status: 400 });
    }
    // Toggle: if exists, remove; else add.
    const existing = await prisma.chatReaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
    });
    if (existing) {
      await prisma.chatReaction.delete({ where: { id: existing.id } });
      return NextResponse.json({ ok: true, op: "remove" });
    }
    const created = await prisma.chatReaction.create({
      data: { messageId, userId, emoji },
    });
    return NextResponse.json(
      { ok: true, op: "add", reaction: created },
      { status: 201 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    const status = errStatus(error);
    if (status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    console.error("POST reaction error:", error);
    return NextResponse.json({ error: "فشل التفاعل" }, { status: 500 });
  }
}
