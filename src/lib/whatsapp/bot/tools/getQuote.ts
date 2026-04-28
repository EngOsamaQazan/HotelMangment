import "server-only";
import { prisma } from "@/lib/prisma";
import { calcQuote, calcMergeQuote } from "@/lib/booking/pricing";
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
 * Authoritative quote for a chosen unit type or merged pair. The bot is
 * NEVER allowed to invent or paraphrase prices — every price-bearing
 * sentence must be backed by a fresh `getQuote` whose `total` matches what
 * the bot will say.
 *
 * The result is also persisted on `BotConversation.lastQuoteJson` so the
 * runtime price-validator (Phase 3) can compare any number the LLM emits
 * against the authoritative figure before we hit "send".
 */

export interface GetQuoteInput {
  /** "unit" or "merge" — must match what searchAvailability returned. */
  kind: "unit" | "merge";
  /** unitTypeId for "unit", mergeId for "merge". */
  id: number;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  guests: number;
}

export interface GetQuoteOutput {
  kind: "unit" | "merge";
  id: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  currency: "JOD";
  /** Per-night breakdown — the bot may reference "the Friday night is X JOD". */
  nightsBreakdown: Array<{ date: string; rate: number }>;
  subtotal: number;
  taxes: number;
  total: number;
  /** Authoritative single-line marketing string the bot may quote verbatim. */
  humanSummaryAr: string;
}

export async function getQuote(
  input: GetQuoteInput,
  ctx: ToolContext,
): Promise<ToolResult<GetQuoteOutput>> {
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

  const quote =
    input.kind === "unit"
      ? await calcQuote({
          unitTypeId: input.id,
          checkIn,
          checkOut,
          guests: input.guests,
        })
      : await calcMergeQuote({
          mergeId: input.id,
          checkIn,
          checkOut,
          guests: input.guests,
        });

  if (quote.unavailableReason) {
    const map: Record<string, string> = {
      not_publicly_bookable: "هذا الخيار ليس متاحاً للحجز المباشر حالياً.",
      unit_type_not_found: "الخيار المطلوب غير موجود.",
      invalid_dates: "نطاق التواريخ غير صالح.",
      no_units: "لا توجد وحدات متاحة لهذا النوع في التواريخ المحددة.",
    };
    return err({
      code: "unavailable",
      message: map[quote.unavailableReason] ?? "غير متاح",
    });
  }

  const summary = `${quote.nights} ليلة × ${
    quote.nightsBreakdown.length
      ? Math.round(quote.subtotal / quote.nights)
      : 0
  } د.أ ≈ المجموع ${quote.total} د.أ`;

  // Persist so Phase 3's price validator can verify any price the LLM utters.
  await prisma.botConversation.update({
    where: { id: ctx.botConv.id },
    data: {
      lastQuoteJson: {
        kind: input.kind,
        id: input.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        nights: quote.nights,
        subtotal: quote.subtotal,
        taxes: quote.taxes,
        total: quote.total,
        currency: quote.currency,
        capturedAt: new Date().toISOString(),
      } as object,
    },
  });

  return ok({
    kind: input.kind,
    id: input.id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights: quote.nights,
    guests: input.guests,
    currency: quote.currency,
    nightsBreakdown: quote.nightsBreakdown.map((n) => ({
      date: n.date,
      rate: n.rate,
    })),
    subtotal: quote.subtotal,
    taxes: quote.taxes,
    total: quote.total,
    humanSummaryAr: summary,
  });
}

export const getQuoteSchema: ToolJsonSchema = {
  name: "getQuote",
  description:
    "Get the authoritative price for a chosen unit type or merged pair. MUST be called before mentioning any price to the guest. The total is in JOD and is the same number Stripe will charge after createPaymentLink.",
  parameters: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["unit", "merge"],
        description: "Must match the `kind` returned by searchAvailability for this option.",
      },
      id: {
        type: "integer",
        description: "unitTypeId for kind='unit', mergeId for kind='merge'.",
      },
      checkIn: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      checkOut: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      guests: { type: "integer", minimum: 1, maximum: 20 },
    },
    required: ["kind", "id", "checkIn", "checkOut", "guests"],
    additionalProperties: false,
  },
};
