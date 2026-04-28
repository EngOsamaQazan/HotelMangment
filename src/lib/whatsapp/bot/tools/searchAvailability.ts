import "server-only";
import {
  findAvailableUnitTypes,
  findAvailableMergedPairs,
} from "@/lib/booking/availability";
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
 * Surface the bookable unit types (and merged-pair offers when guests ≥ 3)
 * for a date window, mirroring what `/api/book/availability` returns to the
 * public site. The bot uses this every time it has fresh dates and needs
 * options to present.
 *
 * We deliberately do NOT include any free text or guest-PII — only the
 * fields the LLM needs to write a natural-language response. Prices come
 * from the SAME booking engine the website uses (no cache, no rounding
 * surprises) so a quote shown by the bot will exactly match the one shown
 * by the web flow if the guest later switches channels.
 */

export interface SearchAvailabilityInput {
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  guests: number;    // ≥1
  /** Optional category filter: "apartment" | "hotel_room" | "suite" | "studio". */
  preferredCategory?: string;
}

export interface SearchAvailabilityOutput {
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  options: Array<{
    /** "unit" or "merge" — the LLM uses this to pick the right hold tool. */
    kind: "unit" | "merge";
    /** unitTypeId for "unit" rows, mergeId for "merge" rows. */
    id: number;
    nameAr: string;
    nameEn: string;
    category: string;
    capacity: number;
    sizeSqm: number | null;
    hasKitchen: boolean;
    /** Approximate JOD/night for marketing copy. Authoritative price comes from getQuote. */
    fromNightlyJod: number | null;
    /** How many physical units are still free for this window. */
    freeUnits: number;
  }>;
}

export async function searchAvailability(
  input: SearchAvailabilityInput,
  _ctx: ToolContext,
): Promise<ToolResult<SearchAvailabilityOutput>> {
  const checkIn = parseISODate(input.checkIn);
  const checkOut = parseISODate(input.checkOut);
  if (!checkIn) {
    return err({ code: "bad_input", message: "checkIn must be YYYY-MM-DD", field: "checkIn" });
  }
  if (!checkOut) {
    return err({ code: "bad_input", message: "checkOut must be YYYY-MM-DD", field: "checkOut" });
  }
  if (checkOut <= checkIn) {
    return err({ code: "bad_input", message: "checkOut must be after checkIn" });
  }
  if (!isPositiveInt(input.guests)) {
    return err({ code: "bad_input", message: "guests must be a positive integer", field: "guests" });
  }

  const nightsMs = checkOut.getTime() - checkIn.getTime();
  const nights = Math.round(nightsMs / 86_400_000);

  const types = await findAvailableUnitTypes({
    checkIn,
    checkOut,
    guests: input.guests,
  });

  const filteredTypes = input.preferredCategory
    ? types.filter((t) => t.category === input.preferredCategory)
    : types;

  const options: SearchAvailabilityOutput["options"] = filteredTypes
    .filter((t) => t.availableCount > 0)
    .map((t) => ({
      kind: "unit" as const,
      id: t.unitTypeId,
      nameAr: t.nameAr,
      nameEn: t.nameEn,
      category: t.category,
      capacity: t.maxOccupancy,
      sizeSqm: t.sizeSqm,
      hasKitchen: t.hasKitchen,
      fromNightlyJod: t.basePriceDaily,
      freeUnits: t.availableCount,
    }));

  // Merged-pair offers are useful for families ≥ 3. The booking engine
  // already enforces the same threshold on the public route.
  if (input.guests >= 3) {
    const pairs = await findAvailableMergedPairs({
      checkIn,
      checkOut,
      guests: input.guests,
    });
    for (const pair of pairs) {
      const niceName = pair.unitTypeNamesAr.join(" + ") || "شقة عائلية مدمجة";
      options.push({
        kind: "merge",
        id: pair.mergeId,
        nameAr: niceName,
        nameEn: niceName,
        category: "merge",
        capacity: pair.maxOccupancy,
        sizeSqm: pair.sizeSqm,
        hasKitchen: pair.hasKitchen,
        fromNightlyJod: pair.basePriceDaily,
        freeUnits: 1,
      });
    }
  }

  return ok({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    guests: input.guests,
    options,
  });
}

export const searchAvailabilitySchema: ToolJsonSchema = {
  name: "searchAvailability",
  description:
    "Search live availability for the requested window. Returns the list of bookable unit types (and merged-pair family offers when guests >= 3). MUST be called every time the user provides or changes dates/guests — never quote availability from memory.",
  parameters: {
    type: "object",
    properties: {
      checkIn: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Check-in date (YYYY-MM-DD).",
      },
      checkOut: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        description: "Check-out date (YYYY-MM-DD), strictly after checkIn.",
      },
      guests: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        description: "Total number of guests (adults + children).",
      },
      preferredCategory: {
        type: "string",
        enum: ["apartment", "hotel_room", "suite", "studio"],
        description: "Optional category filter when the guest expressed a preference.",
      },
    },
    required: ["checkIn", "checkOut", "guests"],
    additionalProperties: false,
  },
};
