import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { runAssistantTurn } from "@/lib/assistant/engine";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);
    const staffName = (session.user?.name as string | undefined) ?? "الموظف";
    const { id } = await params;
    const convId = Number(id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "id غير صالح" }, { status: 400 });

    const conv = await prisma.assistantConversation.findUnique({
      where: { id: convId },
      select: { id: true, userId: true, title: true },
    });
    if (!conv || conv.userId !== userId) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      pageContext?: { path?: string; title?: string | null };
    };
    const message = (body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "الرسالة طويلة جداً (أقصى 4000 حرف)" }, { status: 400 });
    }

    // Auto-title from the first user message.
    if (conv.title === "محادثة جديدة") {
      await prisma.assistantConversation.update({
        where: { id: convId },
        data: { title: message.slice(0, 60) },
      });
    }

    const path = (body.pageContext?.path ?? "").trim();
    const result = await runAssistantTurn({
      conversationId: convId,
      userId,
      staffName,
      userMessage: message,
      pageContext: path
        ? {
            path,
            title: (body.pageContext?.title ?? "").trim() || null,
          }
        : null,
    });

    // Re-fetch the latest messages + any new pending actions for the UI.
    const [messages, actions] = await Promise.all([
      prisma.assistantMessage.findMany({
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
      }),
      prisma.assistantAction.findMany({
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
      }),
    ]);

    return NextResponse.json({
      reply: result.text,
      pendingActionIds: result.pendingActionIds,
      mode: result.mode,
      costUsd: result.costUsd,
      messages,
      actions,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/conversations/[id]/messages", e);
    return NextResponse.json({ error: "فشل إرسال الرسالة" }, { status: 500 });
  }
}
