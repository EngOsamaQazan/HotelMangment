import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/whatsapp/conversations
 *
 *   ?scope=all|mine|unassigned  (default: all)
 *   ?status=open|resolved|archived (default: open)
 *   ?search=<q>
 *   ?priority=normal|high|urgent
 *   ?assignedTo=<userId>
 *   ?limit=50&cursor=<id>
 *
 * Returns one row per conversation with the contact + last message summary
 * and unread count. Built on top of `WhatsAppConversation` so this reflects
 * our CRM state (assignments, priority, mute…) not just the messages table.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "all";
    const status = url.searchParams.get("status") ?? "open";
    const priority = url.searchParams.get("priority");
    const search = (url.searchParams.get("search") ?? "").trim();
    const assignedToParam = url.searchParams.get("assignedTo");
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
      MAX_LIMIT,
    );
    const cursor = url.searchParams.get("cursor");

    const userId = Number((session.user as { id?: string | number }).id);

    const where: Record<string, unknown> = {};
    if (status && status !== "any") where.status = status;
    if (priority) where.priority = priority;
    if (scope === "mine") where.assignedToUserId = userId;
    else if (scope === "unassigned") where.assignedToUserId = null;
    else if (assignedToParam) {
      const v = Number(assignedToParam);
      if (Number.isFinite(v)) where.assignedToUserId = v;
    }
    if (search) {
      where.OR = [
        { contactPhone: { contains: search } },
        { contact: { displayName: { contains: search, mode: "insensitive" } } },
        {
          contact: { waProfileName: { contains: search, mode: "insensitive" } },
        },
        { contact: { nickname: { contains: search, mode: "insensitive" } } },
        { contact: { company: { contains: search, mode: "insensitive" } } },
      ];
    }

    const rows = await prisma.whatsAppConversation.findMany({
      where,
      include: {
        contact: true,
        assignedTo: { select: { id: true, name: true } },
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
      },
      orderBy: { lastMessageAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: Number(cursor) }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      conversations: page.map((c) => ({
        id: c.id,
        contactPhone: c.contactPhone,
        contact: c.contact
          ? {
              id: c.contact.id,
              displayName: c.contact.displayName,
              waProfileName: c.contact.waProfileName,
              nickname: c.contact.nickname,
              company: c.contact.company,
              tags: c.contact.tags,
              isBlocked: c.contact.isBlocked,
            }
          : null,
        assignedTo: c.assignedTo,
        assignedToUserId: c.assignedToUserId,
        status: c.status,
        priority: c.priority,
        isMuted: c.isMuted,
        unreadCount: c.unreadCount,
        lastMessageAt: c.lastMessageAt,
        lastMessage: c.messages[0] ?? null,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error("[GET /api/whatsapp/conversations]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل المحادثات" },
      { status: 500 },
    );
  }
}
