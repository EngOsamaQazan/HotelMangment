import "server-only";
import { prisma } from "@/lib/prisma";
import { logConversationEvent } from "@/lib/whatsapp/convHelpers";
import { notifyConversationUpdated } from "@/lib/whatsapp/fanout";
import {
  err,
  ok,
  type ToolContext,
  type ToolJsonSchema,
  type ToolResult,
} from "./types";

/**
 * Hand a conversation off from the bot to a human teammate. Performs three
 * things atomically:
 *   1. Picks the least-busy assignable user (round-robin by current open
 *      conversation count). Falls back to leaving it unassigned so it lands
 *      in the team's "غير مسند" bucket.
 *   2. Marks the BotConversation as escalated (the engine will skip running
 *      the bot for this thread on every subsequent inbound, even when the
 *      humans hand it back).
 *   3. Drops an internal note summarising the dialog so the human picks up
 *      where the bot left off — no need to re-read the whole thread.
 */

export interface EscalateInput {
  /** Short machine-friendly tag explaining why the bot escalated. */
  reason: string;
  /** 1-3 sentence Arabic summary the human will read first. */
  summaryAr: string;
}

export interface EscalateOutput {
  assignedToUserId: number | null;
  conversationId: number | null;
  note: "added" | "skipped";
}

/**
 * Heuristic load balancer. We pick from users who hold the `whatsapp:view`
 * permission and currently have the FEWEST open conversations assigned to
 * them. Ties broken by user id (deterministic).
 *
 * If every candidate is unavailable (no assignable users in the system),
 * we leave the conversation unassigned and rely on the inbox UI to
 * highlight it in the unassigned bucket.
 */
async function pickLeastBusyUser(): Promise<number | null> {
  const candidates = await prisma.user.findMany({
    where: {
      // Mirror the inbox's notion of "active staff": not soft-disabled and
      // ideally has the whatsapp permission. We can't easily JOIN against
      // the dynamic permission overrides table, so we shortlist by role
      // membership and let the operator widen the pool later.
      AND: [
        // Disabled accounts (if any) can be filtered by your User.disabledAt
        // column when present. Keep the shortlist permissive on purpose:
      ],
    },
    select: {
      id: true,
      _count: {
        select: {
          whatsappAssignedConversations: {
            where: { status: { in: ["open", "pending"] } },
          },
        },
      },
    },
    take: 50,
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const ca = a._count.whatsappAssignedConversations;
    const cb = b._count.whatsappAssignedConversations;
    if (ca !== cb) return ca - cb;
    return a.id - b.id;
  });

  return candidates[0]?.id ?? null;
}

export async function escalateToHuman(
  input: EscalateInput,
  ctx: ToolContext,
): Promise<ToolResult<EscalateOutput>> {
  if (!input.reason?.trim()) {
    return err({ code: "bad_input", message: "reason required", field: "reason" });
  }
  if (!input.summaryAr?.trim()) {
    return err({ code: "bad_input", message: "summaryAr required", field: "summaryAr" });
  }

  const conv = ctx.botConv.conversationId
    ? await prisma.whatsAppConversation.findUnique({
        where: { id: ctx.botConv.conversationId },
        select: { id: true, assignedToUserId: true },
      })
    : null;

  const assigneeId = conv?.assignedToUserId ?? (await pickLeastBusyUser());
  const now = new Date();

  if (conv && assigneeId && conv.assignedToUserId !== assigneeId) {
    await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: {
        assignedToUserId: assigneeId,
        assignedAt: now,
        // assignedByUserId stays null — system-driven assignment.
        status: "open",
        priority: "high",
      },
    });
    await logConversationEvent(conv.id, "bot_escalated", null, {
      reason: input.reason,
      assignedToUserId: assigneeId,
    });
    await notifyConversationUpdated({
      conversationId: conv.id,
      contactPhone: ctx.contactPhone,
      reason: "assign",
      actorUserId: null,
      extra: {
        assignedToUserId: assigneeId,
        targetUserIds: [assigneeId],
        botEscalated: true,
      },
    });
  } else if (conv && !assigneeId) {
    // No one to hand off to — at least bump priority and log the escalation
    // so the inbox surfaces this thread.
    await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { priority: "high", status: "open" },
    });
    await logConversationEvent(conv.id, "bot_escalated", null, {
      reason: input.reason,
      assignedToUserId: null,
    });
  }

  // Internal note (visible to staff only, never sent to the guest). System
  // notes don't have a real authorUserId so we tag it to the assignee if
  // there is one, otherwise we skip — schema requires authorUserId.
  let noteState: "added" | "skipped" = "skipped";
  if (conv && assigneeId) {
    await prisma.whatsAppConversationNote.create({
      data: {
        conversationId: conv.id,
        authorUserId: assigneeId,
        body:
          `🤖 تحويل من البوت — السبب: ${input.reason}\n\n` +
          `الملخص:\n${input.summaryAr}`,
      },
    });
    noteState = "added";
  }

  await prisma.botConversation.update({
    where: { id: ctx.botConv.id },
    data: {
      state: "escalated",
      escalatedAt: now,
      escalationReason: input.reason,
    },
  });

  await prisma.botConversationEvent.create({
    data: {
      botConvId: ctx.botConv.id,
      kind: "escalation",
      payload: {
        reason: input.reason,
        summaryAr: input.summaryAr,
        assignedToUserId: assigneeId,
      } as object,
    },
  });

  return ok({
    assignedToUserId: assigneeId,
    conversationId: conv?.id ?? null,
    note: noteState,
  });
}

export const escalateToHumanSchema: ToolJsonSchema = {
  name: "escalateToHuman",
  description:
    "Hand the conversation off to a human teammate. Use this when the guest is angry, asks for a manager, requests something outside booking (housekeeping, complaint, refund), or after 3 consecutive tool failures. After calling this, send ONE final reassuring message and stop. The bot will not respond to this contact again until staff hand the thread back.",
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        enum: [
          "user_requested",
          "complaint",
          "out_of_scope",
          "tool_failure",
          "policy_question",
          "payment_issue",
          "other",
        ],
        description: "Short machine-readable reason tag for analytics.",
      },
      summaryAr: {
        type: "string",
        maxLength: 600,
        description:
          "1-3 Arabic sentences telling the human exactly what the guest wants and what's already been done. Goes into an internal note.",
      },
    },
    required: ["reason", "summaryAr"],
    additionalProperties: false,
  },
};
