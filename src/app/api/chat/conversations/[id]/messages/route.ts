import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireConversationAccess } from "@/lib/tasks/access";
import { rateLimit } from "@/lib/rateLimit";
import { sendBrandedPushToUsers } from "@/lib/push/server";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/chat/conversations/[id]/messages?cursor=<id>&limit=40
 *
 * Returns messages ordered oldest → newest, but paginated backward: the
 * `cursor` is the OLDEST message id you already have. Response contains the
 * page of messages that come BEFORE that cursor (i.e. older). `nextCursor`
 * in the response is the id to use for the next page request.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("chat:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id: raw } = await params;
    const conversationId = Number(raw);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireConversationAccess(conversationId, userId);

    const { searchParams } = new URL(request.url);
    // NB: `searchParams.get(...)` returns `null` when the param is absent.
    // Passing that through `Number()` would give `0` (and `isFinite(0)` is
    // `true`), which silently adds `where.id = { lt: 0 }` to the query and
    // excludes every message — the thread shows up empty on first load.
    // Only treat the cursor as set when the caller actually sent one.
    const cursorRaw = searchParams.get("cursor");
    const cursorNum = cursorRaw != null ? Number(cursorRaw) : NaN;
    const rawLimit = Number(searchParams.get("limit"));
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_PAGE_SIZE,
    );

    const where: Record<string, unknown> = { conversationId };
    if (Number.isFinite(cursorNum) && cursorNum > 0) {
      where.id = { lt: cursorNum };
    }
    const messagesDesc = await prisma.chatMessage.findMany({
      where,
      orderBy: { id: "desc" },
      take: limit + 1,
      include: {
        sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        attachments: true,
        reactions: {
          select: { userId: true, emoji: true },
        },
        replyTo: {
          select: {
            id: true,
            body: true,
            deletedAt: true,
            sender: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
    const hasMore = messagesDesc.length > limit;
    const page = hasMore ? messagesDesc.slice(0, limit) : messagesDesc;
    const oldest = page[page.length - 1];
    return NextResponse.json({
      messages: page.reverse(),
      nextCursor: hasMore && oldest ? oldest.id : null,
    });
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
    console.error("GET messages error:", error);
    return NextResponse.json({ error: "فشل تحميل الرسائل" }, { status: 500 });
  }
}

/**
 * POST /api/chat/conversations/[id]/messages
 * body: { body: string, replyToId?: number }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("chat:create");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id: raw } = await params;
    const conversationId = Number(raw);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireConversationAccess(conversationId, userId);

    const rl = rateLimit(`chat:msg:${userId}`, 20, 10_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "أنت ترسل الرسائل بوتيرة عالية. حاول مجدداً بعد قليل." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { body: text, replyToId } = body as {
      body?: string;
      replyToId?: number;
    };
    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "لا يمكن إرسال رسالة فارغة" },
        { status: 400 },
      );
    }
    if (text.length > 4000) {
      return NextResponse.json(
        { error: "الرسالة طويلة جداً (الحد 4000 حرف)" },
        { status: 400 },
      );
    }

    const { message: created, recipientIds } = await prisma.$transaction(async (tx) => {
      const msg = await tx.chatMessage.create({
        data: {
          conversationId,
          senderId: userId,
          body: text.trim(),
          replyToId: Number.isFinite(replyToId) ? Number(replyToId) : null,
        },
        include: {
          sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
          attachments: true,
          reactions: { select: { userId: true, emoji: true } },
          replyTo: {
            select: {
              id: true,
              body: true,
              deletedAt: true,
              sender: { select: { id: true, name: true, avatarUrl: true } },
            },
          },
        },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: msg.createdAt },
      });
      // In-app notifications for other participants
      const others = await tx.chatParticipant.findMany({
        where: {
          conversationId,
          leftAt: null,
          userId: { not: userId },
        },
        include: {
          user: { select: { id: true } },
        },
      });
      if (others.length) {
        await tx.notification.createMany({
          data: others.map((p) => ({
            userId: p.userId,
            type: "chat.message",
            title: "رسالة جديدة",
            body: msg.body.slice(0, 120),
            linkUrl: `/chat/${conversationId}`,
            payloadJson: { conversationId, messageId: msg.id },
          })),
        });
      }
      return { message: msg, recipientIds: others.map((p) => p.userId) };
    });

    // Branded web-push fan-out — runs outside the transaction so a push
    // provider glitch never blocks the DB commit. Fire-and-forget.
    if (recipientIds.length) {
      const senderName = created.sender?.name || "زميل";
      const avatarUrl = created.sender?.avatarUrl || undefined;
      void sendBrandedPushToUsers(recipientIds, {
        module: "chat",
        title: `رسالة من ${senderName}`,
        body: created.body.slice(0, 140),
        url: `/chat/${conversationId}`,
        tag: `chat-${conversationId}`,
        image: avatarUrl,
        data: { conversationId, messageId: created.id },
      });
    }

    return NextResponse.json(created, { status: 201 });
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
    console.error("POST messages error:", error);
    return NextResponse.json(
      { error: "فشل إرسال الرسالة" },
      { status: 500 },
    );
  }
}
