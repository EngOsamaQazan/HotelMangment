import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

// ---------------------------------------------------------------------------
// POST /api/assistant/learning/failures/manual
//
// Lets an admin convert an existing assistant turn into an `AssistantFailure`
// row even when the apology detector did NOT fire (e.g. the model returned a
// confident-but-wrong answer). The drafter can then turn the failure into a
// lesson exactly like the auto-captured ones.
//
// Body:
//   {
//     conversationId: number,
//     userMessageId?:  number | null,   // optional anchor to the user input
//     assistantMessageId: number,        // REQUIRED — the wrong reply
//     reviewNote?: string,
//     tags?: string[]
//   }
//
// Idempotency: if a failure already exists for the same conversationId +
// userMessageId, we update its tags/reviewNote instead of creating a new
// row. This means the admin can safely re-mark a turn without polluting
// the inbox.
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  "not_found",
  "no_permission",
  "unclear",
  "hallucinated",
  "tool_error",
  "uncertain",
  "deflection",
  "wrong_answer",
]);

export async function POST(request: Request) {
  try {
    const session = await requirePermission("assistant:learning_review");
    const reviewerId = Number((session.user as { id?: string | number }).id);

    const body = (await request.json().catch(() => ({}))) as {
      conversationId?: number;
      userMessageId?: number | null;
      assistantMessageId?: number;
      reviewNote?: string;
      tags?: string[];
    };
    const conversationId = Number(body.conversationId);
    const assistantMessageId = Number(body.assistantMessageId);
    if (!Number.isFinite(conversationId) || !Number.isFinite(assistantMessageId)) {
      return NextResponse.json({ error: "معرّفات غير صالحة" }, { status: 400 });
    }

    const assistantMessage = await prisma.assistantMessage.findUnique({
      where: { id: assistantMessageId },
      select: { id: true, role: true, content: true, conversationId: true },
    });
    if (!assistantMessage || assistantMessage.conversationId !== conversationId) {
      return NextResponse.json({ error: "الرسالة غير موجودة في هذه المحادثة" }, { status: 404 });
    }
    if (assistantMessage.role !== "assistant") {
      return NextResponse.json({ error: "يمكن وسم رسائل المساعد فقط" }, { status: 400 });
    }

    let userMessageId: number | null = null;
    if (body.userMessageId != null) {
      userMessageId = Number(body.userMessageId);
      if (!Number.isFinite(userMessageId)) userMessageId = null;
    }
    if (!userMessageId) {
      // Fall back to the latest user message before the flagged assistant
      // turn. Picks the closest input the assistant was responding to.
      const prev = await prisma.assistantMessage.findFirst({
        where: { conversationId, role: "user", id: { lt: assistantMessageId } },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      userMessageId = prev?.id ?? null;
    }

    const userText = userMessageId
      ? (
          await prisma.assistantMessage.findUnique({
            where: { id: userMessageId },
            select: { content: true },
          })
        )?.content ?? ""
      : "";

    const note = typeof body.reviewNote === "string" ? body.reviewNote.slice(0, 1000) : null;
    const incomingTags = Array.isArray(body.tags) ? body.tags : [];
    const tags = Array.from(
      new Set(
        ["wrong_answer", ...incomingTags].filter((t) => ALLOWED_TAGS.has(String(t))),
      ),
    );

    const existing = userMessageId
      ? await prisma.assistantFailure.findFirst({
          where: { conversationId, userMessageId },
          select: { id: true },
        })
      : null;

    let failure;
    if (existing) {
      failure = await prisma.assistantFailure.update({
        where: { id: existing.id },
        data: {
          assistantReply: assistantMessage.content,
          tagsJson: tags as unknown as Prisma.InputJsonValue,
          reviewNote: note,
          reviewedById: Number.isFinite(reviewerId) ? reviewerId : null,
          reviewedAt: new Date(),
          status: "open",
        },
        select: { id: true, status: true },
      });
    } else {
      failure = await prisma.assistantFailure.create({
        data: {
          conversationId,
          userMessageId,
          userText,
          assistantReply: assistantMessage.content,
          toolsTried: [] as unknown as Prisma.InputJsonValue,
          pageContext: Prisma.JsonNull,
          tagsJson: tags as unknown as Prisma.InputJsonValue,
          reviewNote: note,
          reviewedById: Number.isFinite(reviewerId) ? reviewerId : null,
          reviewedAt: new Date(),
          status: "open",
        },
        select: { id: true, status: true },
      });
    }

    return NextResponse.json({ ok: true, failure });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/learning/failures/manual", e);
    return NextResponse.json({ error: "فشل تسجيل الإخفاق اليدوي" }, { status: 500 });
  }
}
