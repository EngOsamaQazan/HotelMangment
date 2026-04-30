import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

// ---------------------------------------------------------------------------
// GET /api/assistant/learning/conversations/[id]
//
// Full message history for a single staff assistant conversation. Each
// assistant message is enriched with the immediate preceding user message
// id so the UI can target individual turns when creating manual lessons /
// failures.
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("assistant:learning_review");
    const { id } = await ctx.params;
    const conversationId = Number(id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    const conversation = await prisma.assistantConversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        title: true,
        llmTurns: true,
        costUsdTotal: true,
        lastMessageAt: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });
    if (!conversation) {
      return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
    }

    const messages = await prisma.assistantMessage.findMany({
      where: { conversationId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        toolCallId: true,
        toolName: true,
        usage: true,
        createdAt: true,
      },
    });

    // Pair each assistant message with the preceding user message + collect
    // any tool turns in between so the admin sees the full chain at a glance.
    let lastUserId: number | null = null;
    const enriched = messages.map((m) => {
      if (m.role === "user") lastUserId = m.id;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        toolName: m.toolName ?? null,
        toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : null,
        usage: m.usage ?? null,
        createdAt: m.createdAt.toISOString(),
        precedingUserId: m.role === "assistant" ? lastUserId : null,
      };
    });

    const failures = await prisma.assistantFailure.findMany({
      where: { conversationId },
      orderBy: { id: "asc" },
      select: {
        id: true,
        userMessageId: true,
        userText: true,
        assistantReply: true,
        status: true,
        tagsJson: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        staff: conversation.user.name,
        llmTurns: conversation.llmTurns,
        costUsd: Number(conversation.costUsdTotal),
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        createdAt: conversation.createdAt.toISOString(),
      },
      messages: enriched,
      failures: failures.map((f) => ({
        id: f.id,
        userMessageId: f.userMessageId,
        userText: f.userText,
        assistantReply: f.assistantReply,
        status: f.status,
        tags: f.tagsJson,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/learning/conversations/[id]", e);
    return NextResponse.json({ error: "فشل تحميل المحادثة" }, { status: 500 });
  }
}
