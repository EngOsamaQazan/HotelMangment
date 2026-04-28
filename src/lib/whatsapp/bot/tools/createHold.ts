import "server-only";
import { prisma } from "@/lib/prisma";
import {
  createHold as createUnitHold,
  createMergeHold,
  HoldError,
  HOLD_TTL_MINUTES,
} from "@/lib/booking/hold";
import {
  err,
  ok,
  parseISODate,
  isPositiveInt,
  type ToolContext,
  type ToolJsonSchema,
  type ToolResult,
} from "./types";

/**
 * Create a 15-minute hold on the chosen unit (or merged pair) on behalf of
 * the guest. Mirrors `/api/book/hold` exactly — same engine, same TTL, same
 * race-checks — but bypasses the HTTP layer because the bot is authenticated
 * to act for the guest by virtue of message ownership (Meta-attested phone).
 *
 * Side effects:
 *   • Writes `lastHoldId` + clears any stale `paymentSessionId` on the
 *     BotConversation so the engine forgets the previous hold.
 *   • A successful hold puts the conversation in state="holding" — the
 *     LLM is then expected to immediately call `createPaymentLink`.
 */

export interface CreateHoldInput {
  kind: "unit" | "merge";
  id: number;
  checkIn: string;
  checkOut: string;
  guests: number;
  /** Optional override; otherwise we use the WhatsApp profile name. */
  guestName?: string;
}

export interface CreateHoldOutput {
  holdId: number;
  /** Sibling row id for merged-pair holds (null for single-unit holds). */
  siblingHoldId: number | null;
  expiresAtIso: string;
  expiresInMinutes: number;
  total: number;
  currency: "JOD";
}

export async function createHold(
  input: CreateHoldInput,
  ctx: ToolContext,
): Promise<ToolResult<CreateHoldOutput>> {
  if (!ctx.guestAccount) {
    return err({
      code: "internal",
      message: "createHold requires an established GuestAccount; engine should have provisioned one upstream.",
    });
  }
  if (input.kind !== "unit" && input.kind !== "merge") {
    return err({ code: "bad_input", message: "kind must be 'unit' or 'merge'", field: "kind" });
  }
  if (!isPositiveInt(input.id)) {
    return err({ code: "bad_input", message: "id must be a positive integer", field: "id" });
  }
  if (!isPositiveInt(input.guests)) {
    return err({ code: "bad_input", message: "guests must be a positive integer", field: "guests" });
  }
  const checkIn = parseISODate(input.checkIn);
  const checkOut = parseISODate(input.checkOut);
  if (!checkIn || !checkOut) {
    return err({ code: "bad_input", message: "dates must be YYYY-MM-DD" });
  }
  if (checkOut <= checkIn) {
    return err({ code: "bad_input", message: "checkOut must be after checkIn" });
  }

  const guestName =
    (input.guestName?.trim() ||
      ctx.guestAccount.fullName?.trim() ||
      ctx.contactName?.trim() ||
      "ضيف").slice(0, 120);

  try {
    if (input.kind === "unit") {
      const result = await createUnitHold({
        unitTypeId: input.id,
        checkIn,
        checkOut,
        guests: input.guests,
        guestAccountId: ctx.guestAccount.id,
        guestName,
        phone: ctx.contactPhone,
      });

      await prisma.botConversation.update({
        where: { id: ctx.botConv.id },
        data: {
          lastHoldId: result.holdId,
          paymentSessionId: null,
          paymentLinkUrl: null,
          paymentExpiresAt: null,
          state: "holding",
        },
      });

      return ok({
        holdId: result.holdId,
        siblingHoldId: null,
        expiresAtIso: result.expiresAt.toISOString(),
        expiresInMinutes: HOLD_TTL_MINUTES,
        total: result.quote.total,
        currency: "JOD",
      });
    }

    // merge branch
    const result = await createMergeHold({
      mergeId: input.id,
      checkIn,
      checkOut,
      guests: input.guests,
      guestAccountId: ctx.guestAccount.id,
      guestName,
      phone: ctx.contactPhone,
    });

    await prisma.botConversation.update({
      where: { id: ctx.botConv.id },
      data: {
        lastHoldId: result.holdId,
        paymentSessionId: null,
        paymentLinkUrl: null,
        paymentExpiresAt: null,
        state: "holding",
      },
    });

    return ok({
      holdId: result.holdId,
      siblingHoldId: result.siblingHoldId,
      expiresAtIso: result.expiresAt.toISOString(),
      expiresInMinutes: HOLD_TTL_MINUTES,
      total: result.quote.total,
      currency: "JOD",
    });
  } catch (e) {
    if (e instanceof HoldError) {
      // HoldError already carries an Arabic message tuned for end-users.
      const mapped =
        e.code === "unavailable" || e.code === "race"
          ? ("unavailable" as const)
          : e.code === "not_found"
            ? ("not_found" as const)
            : ("internal" as const);
      return err({ code: mapped, message: e.message });
    }
    console.error("[bot/tools/createHold] unexpected", e);
    return err({ code: "internal", message: "تعذّر تثبيت الحجز مؤقتاً، حاول بعد لحظات." });
  }
}

export const createHoldSchema: ToolJsonSchema = {
  name: "createHold",
  description:
    "Place a 15-minute hold on the chosen unit (or merged pair) for the guest. After this returns ok, you MUST call createPaymentLink immediately. The hold expires at expiresAtIso — never promise the guest more time than that.",
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["unit", "merge"] },
      id: { type: "integer" },
      checkIn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      checkOut: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      guests: { type: "integer", minimum: 1, maximum: 20 },
      guestName: {
        type: "string",
        description:
          "Override the guest's name on the reservation. Omit unless the guest explicitly told you to use a different name.",
      },
    },
    required: ["kind", "id", "checkIn", "checkOut", "guests"],
    additionalProperties: false,
  },
};
