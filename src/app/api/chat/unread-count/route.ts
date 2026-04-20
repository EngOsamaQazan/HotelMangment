import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/chat/unread-count
 * Lightweight endpoint for the sidebar badge.
 * Returns { total, conversations } — `total` is the sum of unread messages
 * across all conversations the caller participates in.
 */
export async function GET() {
  try {
    const session = await requirePermission("chat:view");
    const userId = Number((session.user as { id?: string | number }).id);

    const parts = await prisma.chatParticipant.findMany({
      where: { userId, leftAt: null },
      select: { conversationId: true, lastReadAt: true },
    });
    if (parts.length === 0) {
      return NextResponse.json({ total: 0, conversations: 0 });
    }

    const epoch = new Date(0);
    const counts = await Promise.all(
      parts.map((p) =>
        prisma.chatMessage.count({
          where: {
            conversationId: p.conversationId,
            createdAt: { gt: p.lastReadAt ?? epoch },
            senderId: { not: userId },
            deletedAt: null,
          },
        }),
      ),
    );
    const total = counts.reduce((a, b) => a + b, 0);
    const conversations = counts.filter((c) => c > 0).length;
    return NextResponse.json({ total, conversations });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/chat/unread-count error:", error);
    return NextResponse.json({ total: 0, conversations: 0 });
  }
}
