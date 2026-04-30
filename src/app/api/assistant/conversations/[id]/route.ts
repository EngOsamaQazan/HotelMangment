import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const convId = Number(id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "id غير صالح" }, { status: 400 });

    const conv = await prisma.assistantConversation.findUnique({
      where: { id: convId },
      select: {
        id: true,
        userId: true,
        title: true,
        createdAt: true,
        lastMessageAt: true,
        llmTurns: true,
        costUsdTotal: true,
      },
    });
    if (!conv || conv.userId !== userId) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const messages = await prisma.assistantMessage.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        toolCalls: true,
        toolName: true,
        toolCallId: true,
        createdAt: true,
      },
    });

    const actions = await prisma.assistantAction.findMany({
      where: { conversationId: convId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        summary: true,
        payload: true,
        status: true,
        executedRefId: true,
        errorMessage: true,
        expiresAt: true,
        createdAt: true,
        executedAt: true,
      },
    });

    return NextResponse.json({
      conversation: { ...conv, costUsdTotal: Number(conv.costUsdTotal) },
      messages,
      actions,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/conversations/[id]", e);
    return NextResponse.json({ error: "فشل تحميل المحادثة" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const convId = Number(id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "id غير صالح" }, { status: 400 });

    const result = await prisma.assistantConversation.updateMany({
      where: { id: convId, userId },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("DELETE /api/assistant/conversations/[id]", e);
    return NextResponse.json({ error: "فشل أرشفة المحادثة" }, { status: 500 });
  }
}
