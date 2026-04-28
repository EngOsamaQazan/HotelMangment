import "server-only";
import { prisma } from "@/lib/prisma";
import {
  err,
  ok,
  type ToolContext,
  type ToolJsonSchema,
  type ToolResult,
} from "./types";

/**
 * Voluntarily release a pending hold (guest changed their mind, picked a
 * different option, etc.). We delete the row outright instead of marking
 * it cancelled so the unit is immediately released — confirmed/active
 * reservations are never touched. Idempotent: cancelling a non-existent
 * hold is a no-op success.
 *
 * Merged-pair holds: cancelling one side automatically cancels the sibling
 * row (same `groupId`).
 */

export interface CancelHoldInput {
  holdId: number;
}

export interface CancelHoldOutput {
  released: number; // 0, 1, or 2 (merged pair)
}

export async function cancelHold(
  input: CancelHoldInput,
  ctx: ToolContext,
): Promise<ToolResult<CancelHoldOutput>> {
  if (!input.holdId || typeof input.holdId !== "number") {
    return err({ code: "bad_input", message: "holdId required", field: "holdId" });
  }

  const hold = await prisma.reservation.findUnique({
    where: { id: input.holdId },
    select: {
      id: true,
      status: true,
      groupId: true,
      guestAccountId: true,
    },
  });

  if (!hold) return ok({ released: 0 }); // already gone

  if (hold.status !== "pending_hold") {
    return err({
      code: "bad_input",
      message: "هذا الحجز لم يعد مؤقتاً ولا يمكن إلغاؤه عبر البوت.",
    });
  }

  // Cross-check ownership — never let one guest's bot session release another
  // guest's hold even if the LLM gets confused about ids.
  if (
    ctx.guestAccount &&
    hold.guestAccountId &&
    hold.guestAccountId !== ctx.guestAccount.id
  ) {
    return err({ code: "bad_input", message: "هذا الحجز يخص حساباً آخر." });
  }

  // Merged pairs share groupId — release both halves atomically.
  let released = 0;
  if (hold.groupId) {
    const r = await prisma.reservation.deleteMany({
      where: { groupId: hold.groupId, status: "pending_hold" },
    });
    released = r.count;
  } else {
    await prisma.reservation.delete({ where: { id: hold.id } });
    released = 1;
  }

  // Wipe the BotConversation pointer if it still references this hold.
  if (ctx.botConv.lastHoldId === input.holdId) {
    await prisma.botConversation.update({
      where: { id: ctx.botConv.id },
      data: {
        lastHoldId: null,
        paymentSessionId: null,
        paymentLinkUrl: null,
        paymentExpiresAt: null,
        state: "collecting",
      },
    });
  }

  return ok({ released });
}

export const cancelHoldSchema: ToolJsonSchema = {
  name: "cancelHold",
  description:
    "Release a previously created hold when the guest changes their mind or wants different dates/options. Safe to call repeatedly — already-released holds return released=0.",
  parameters: {
    type: "object",
    properties: {
      holdId: {
        type: "integer",
        description:
          "The holdId you got from createHold. For merged-pair holds, either side works — the sibling is released automatically.",
      },
    },
    required: ["holdId"],
    additionalProperties: false,
  },
};
