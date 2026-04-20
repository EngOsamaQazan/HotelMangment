import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/chat/conversations
 * Returns the caller's conversations, each with:
 *   - participants (users)
 *   - last message preview
 *   - unread count (based on lastReadAt)
 */
export async function GET() {
  try {
    const session = await requirePermission("chat:view");
    const userId = Number((session.user as { id?: string | number }).id);

    const conversations = await prisma.chatConversation.findMany({
      where: {
        participants: { some: { userId, leftAt: null } },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        task: { select: { id: true, title: true, boardId: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    });

    // Unread count per conversation: messages after lastReadAt, not from me.
    const results = await Promise.all(
      conversations.map(async (c) => {
        const me = c.participants.find((p) => p.userId === userId);
        const cutoff = me?.lastReadAt ?? new Date(0);
        const unread = await prisma.chatMessage.count({
          where: {
            conversationId: c.id,
            createdAt: { gt: cutoff },
            senderId: { not: userId },
            deletedAt: null,
          },
        });
        return {
          ...c,
          lastMessage: c.messages[0] ?? null,
          messages: undefined,
          unreadCount: unread,
        };
      }),
    );

    return NextResponse.json(results);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/chat/conversations error:", error);
    return NextResponse.json(
      { error: "فشل تحميل المحادثات" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/chat/conversations
 * Body:
 *   - type: "dm" | "group" | "task"
 *   - userIds: number[]     (participants; creator auto-added)
 *   - title?: string        (required for group)
 *   - taskId?: number       (for task-scoped conversations)
 *
 * For DMs, reuses an existing conversation if one already exists between the
 * same two users.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("chat:create");
    const userId = Number((session.user as { id?: string | number }).id);
    const body = await request.json().catch(() => ({}));
    const { type, userIds, title, taskId } = body as {
      type?: string;
      userIds?: number[];
      title?: string;
      taskId?: number;
    };
    if (!["dm", "group", "task"].includes(type || "")) {
      return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 });
    }
    const ids = Array.isArray(userIds)
      ? Array.from(
          new Set(
            userIds
              .map(Number)
              .filter((n) => Number.isFinite(n) && n !== userId),
          ),
        )
      : [];
    if (type === "dm") {
      if (ids.length !== 1) {
        return NextResponse.json(
          { error: "المحادثة الثنائية تتطلب مستخدماً واحداً" },
          { status: 400 },
        );
      }
      const otherId = ids[0];
      // Reuse existing DM if any
      const existing = await prisma.chatConversation.findFirst({
        where: {
          type: "dm",
          AND: [
            { participants: { some: { userId, leftAt: null } } },
            { participants: { some: { userId: otherId, leftAt: null } } },
          ],
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
      if (existing) return NextResponse.json(existing);
    }
    if (type === "group") {
      if (!title || !title.trim()) {
        return NextResponse.json(
          { error: "عنوان المجموعة مطلوب" },
          { status: 400 },
        );
      }
      if (ids.length < 1) {
        return NextResponse.json(
          { error: "أضف عضواً واحداً على الأقل" },
          { status: 400 },
        );
      }
    }
    if (type === "task") {
      if (!Number.isFinite(taskId)) {
        return NextResponse.json(
          { error: "معرف المهمة مطلوب" },
          { status: 400 },
        );
      }
      // Reuse any existing task conversation for this task (prevent duplicates).
      const existing = await prisma.chatConversation.findFirst({
        where: { type: "task", taskId: taskId as number },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          task: { select: { id: true, title: true, boardId: true } },
        },
        orderBy: { id: "asc" },
      });
      if (existing) {
        // Ensure caller is a participant; add missing requested users too.
        const existingUserIds = new Set(existing.participants.map((p) => p.userId));
        const toAdd = [userId, ...ids].filter((u) => !existingUserIds.has(u));
        if (toAdd.length > 0) {
          await prisma.chatParticipant.createMany({
            data: toAdd.map((uid) => ({
              conversationId: existing.id,
              userId: uid,
              role: uid === userId ? "admin" : "member",
            })),
            skipDuplicates: true,
          });
          const refreshed = await prisma.chatConversation.findUniqueOrThrow({
            where: { id: existing.id },
            include: {
              participants: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
              task: { select: { id: true, title: true, boardId: true } },
            },
          });
          return NextResponse.json(refreshed);
        }
        return NextResponse.json(existing);
      }
    }

    const conv = await prisma.$transaction(async (tx) => {
      const created = await tx.chatConversation.create({
        data: {
          type: type as string,
          title: type === "group" ? title!.trim() : null,
          taskId: type === "task" ? (taskId as number) : null,
          createdById: userId,
          lastMessageAt: null,
        },
      });
      const allParticipants = Array.from(new Set([userId, ...ids]));
      await tx.chatParticipant.createMany({
        data: allParticipants.map((uid) => ({
          conversationId: created.id,
          userId: uid,
          role: uid === userId ? "admin" : "member",
        })),
      });
      return tx.chatConversation.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          participants: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          task: { select: { id: true, title: true, boardId: true } },
        },
      });
    });

    return NextResponse.json(conv, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/chat/conversations error:", error);
    return NextResponse.json(
      { error: "فشل إنشاء المحادثة" },
      { status: 500 },
    );
  }
}
