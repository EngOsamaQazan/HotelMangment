import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireConversationAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * GET /api/chat/messages/[id]
 * Fetch a single message with all includes needed to render it in the
 * thread. Used by the realtime handler when a `chat:event` notification
 * arrives so we can hydrate the new/updated message without re-pulling
 * the whole page.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("chat:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id: raw } = await params;
    const messageId = Number(raw);
    if (!Number.isFinite(messageId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        attachments: true,
        reactions: { select: { userId: true, emoji: true } },
        replyTo: {
          select: {
            id: true,
            body: true,
            deletedAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!msg) {
      return NextResponse.json(
        { error: "لم يُعثر على الرسالة" },
        { status: 404 },
      );
    }
    await requireConversationAccess(msg.conversationId, userId);
    return NextResponse.json(msg);
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
    console.error("GET message error:", error);
    return NextResponse.json({ error: "فشل تحميل الرسالة" }, { status: 500 });
  }
}

export async function PATCH(
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
    });
    if (!msg || msg.deletedAt) {
      return NextResponse.json(
        { error: "لم يُعثر على الرسالة" },
        { status: 404 },
      );
    }
    if (msg.senderId !== userId) {
      return NextResponse.json(
        { error: "لا يمكنك تعديل رسالة غيرك" },
        { status: 403 },
      );
    }
    if (Date.now() - msg.createdAt.getTime() > EDIT_WINDOW_MS) {
      return NextResponse.json(
        { error: "انتهت مهلة التعديل" },
        { status: 400 },
      );
    }
    await requireConversationAccess(msg.conversationId, userId);
    const body = await request.json().catch(() => ({}));
    const { body: text } = body as { body?: string };
    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "النص مطلوب" },
        { status: 400 },
      );
    }
    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: text.trim(), editedAt: new Date() },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        attachments: true,
        reactions: { select: { userId: true, emoji: true } },
        replyTo: {
          select: {
            id: true,
            body: true,
            deletedAt: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
    });
    return NextResponse.json(updated);
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
    console.error("PATCH message error:", error);
    return NextResponse.json({ error: "فشل التعديل" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
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
    });
    if (!msg) return NextResponse.json({ ok: true });
    if (msg.senderId !== userId) {
      // allow admins in the same conversation
      const part = await prisma.chatParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: msg.conversationId,
            userId,
          },
        },
      });
      if (!part || part.role !== "admin") {
        return NextResponse.json(
          { error: "لا يمكنك حذف رسالة غيرك" },
          { status: 403 },
        );
      }
    }
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "" },
    });
    return NextResponse.json({ ok: true });
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
    console.error("DELETE message error:", error);
    return NextResponse.json({ error: "فشل الحذف" }, { status: 500 });
  }
}
