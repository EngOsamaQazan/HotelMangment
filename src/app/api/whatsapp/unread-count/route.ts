import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/whatsapp/unread-count
 *
 * Lightweight endpoint for the sidebar badge.
 *
 *   • `mine`          — sum of unreadCount across conversations assigned to me.
 *   • `unassignedMine`— + unreadCount on unassigned threads (staff still sees
 *                       those as they need claiming).
 *   • `total`         — overall unread across everything I can see (for
 *                       whatsapp:view users with no assignment filter).
 *   • `conversations` — number of threads with unreadCount > 0.
 *
 * Hybrid assignment model: by default we show `mine + unassigned` on the
 * sidebar so assigned owners AND on-call staff all see an attention-grabbing
 * badge the moment a new thread lands.
 */
export async function GET() {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const userId = Number((session.user as { id?: string | number }).id);

    const [mineRows, unassignedRows, totalRows] = await Promise.all([
      prisma.whatsAppConversation.findMany({
        where: {
          assignedToUserId: userId,
          status: "open",
          unreadCount: { gt: 0 },
          isMuted: false,
        },
        select: { unreadCount: true },
      }),
      prisma.whatsAppConversation.findMany({
        where: {
          assignedToUserId: null,
          status: "open",
          unreadCount: { gt: 0 },
          isMuted: false,
        },
        select: { unreadCount: true },
      }),
      prisma.whatsAppConversation.aggregate({
        where: { status: "open", unreadCount: { gt: 0 } },
        _sum: { unreadCount: true },
        _count: { id: true },
      }),
    ]);

    const mine = mineRows.reduce((a, c) => a + c.unreadCount, 0);
    const unassigned = unassignedRows.reduce((a, c) => a + c.unreadCount, 0);
    const total = totalRows._sum.unreadCount ?? 0;

    return NextResponse.json({
      mine,
      unassigned,
      mineAndUnassigned: mine + unassigned,
      total,
      conversations: mineRows.length + unassignedRows.length,
    });
  } catch (error) {
    console.error("GET /api/whatsapp/unread-count error:", error);
    return NextResponse.json({
      mine: 0,
      unassigned: 0,
      mineAndUnassigned: 0,
      total: 0,
      conversations: 0,
    });
  }
}
