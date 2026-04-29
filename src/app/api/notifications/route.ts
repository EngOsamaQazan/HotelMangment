import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/notifications
 *
 * Query params:
 *   ?unreadOnly=true     – only rows where readAt IS NULL
 *   ?archived=true|false – include only archived (true) / unarchived (false)
 *   ?category=tasks      – filter by event category
 *   ?type=task.assigned  – filter by exact event code
 *   ?priority=2          – filter by minimum priority (>=)
 *   ?q=text              – substring match against title/body
 *   ?limit=50            – page size (max 100)
 *   ?cursor=123          – id-based cursor (older < cursor)
 *
 * Snoozed rows whose `snoozedUntil` is still in the future are hidden
 * from every response shape (the bell + the center).
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { searchParams } = new URL(request.url);

    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const archivedParam = searchParams.get("archived");
    const category = searchParams.get("category") || undefined;
    const type = searchParams.get("type") || undefined;
    const priorityRaw = searchParams.get("priority");
    const minPriority = priorityRaw !== null ? Number(priorityRaw) : undefined;
    const q = (searchParams.get("q") || "").trim();
    const cursor = Number(searchParams.get("cursor")) || undefined;
    const limit = Math.min(100, Number(searchParams.get("limit")) || 30);

    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      userId,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      ...(unreadOnly ? { readAt: null } : {}),
      ...(archivedParam === "true"
        ? { archivedAt: { not: null } }
        : archivedParam === "false"
          ? { archivedAt: null }
          : {}),
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
      ...(typeof minPriority === "number" && Number.isFinite(minPriority)
        ? { priority: { gte: minPriority } }
        : {}),
      ...(q
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: q, mode: "insensitive" as const } },
                  { body: { contains: q, mode: "insensitive" as const } },
                ],
              },
            ],
          }
        : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    };

    const [items, unreadCount, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.notification.count({
        where: {
          userId,
          readAt: null,
          archivedAt: null,
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
        },
      }),
      prisma.notification.count({
        where: {
          userId,
          archivedAt: null,
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
        },
      }),
    ]);

    const nextCursor =
      items.length === limit ? items[items.length - 1].id : null;

    return NextResponse.json({
      items,
      unreadCount,
      totalCount,
      nextCursor,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/notifications error:", error);
    return NextResponse.json(
      { error: "فشل تحميل الإشعارات" },
      { status: 500 },
    );
  }
}
