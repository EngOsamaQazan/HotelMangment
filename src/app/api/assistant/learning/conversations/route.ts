import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

// ---------------------------------------------------------------------------
// GET /api/assistant/learning/conversations
//
// Admin review of every staff assistant conversation — independent of
// whether the apology detector fired. Used by the learning UI so admins
// can hand-pick assistant turns that "looked right" but were actually
// wrong, and convert them into failures + lessons.
//
// Query: ?search=<text>&limit=<n>&offset=<n>
// Returns: list of conversations with their owner, totals, and last user
//   message preview. Sorted by most-recent activity.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    await requirePermission("assistant:learning_review");
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 50) || 50, 200));
    const offset = Math.max(0, Number(searchParams.get("offset") || 0) || 0);

    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { user: { name: { contains: search, mode: "insensitive" as const } } },
            {
              messages: {
                some: { content: { contains: search, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      prisma.assistantConversation.findMany({
        where,
        orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          llmTurns: true,
          costUsdTotal: true,
          lastMessageAt: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
          messages: {
            where: { role: "user" },
            orderBy: { id: "desc" },
            take: 1,
            select: { content: true, createdAt: true },
          },
        },
      }),
      prisma.assistantConversation.count({ where }),
    ]);

    return NextResponse.json({
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        staff: r.user.name,
        messageCount: r._count.messages,
        llmTurns: r.llmTurns,
        costUsd: Number(r.costUsdTotal),
        lastUserMessage: r.messages[0]?.content?.slice(0, 220) ?? null,
        lastUserAt: r.messages[0]?.createdAt?.toISOString() ?? null,
        lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/learning/conversations", e);
    return NextResponse.json({ error: "فشل تحميل المحادثات" }, { status: 500 });
  }
}
