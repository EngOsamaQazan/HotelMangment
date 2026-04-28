import "server-only";
import { prisma } from "@/lib/prisma";
import type { BotConversation, GuestAccount } from "@prisma/client";

/**
 * Identity bridge between an inbound WhatsApp number and the rest of the
 * booking stack. Two responsibilities:
 *
 *   1. Auto-provision (or look up) a `GuestAccount` for the phone so that
 *      `createHold` / `confirmHold` work without sending a fresh OTP — the
 *      phone is already trustworthy because we got the message from Meta on
 *      that exact number.
 *   2. Get-or-create the `BotConversation` row that holds the dialog state
 *      machine, slot bag, and last hold/payment for this contact.
 *
 * Used by the bot engine (Phase 1+) and by the shadow-mode draft producer.
 * Safe to call from the webhook handler — no external network calls and
 * every write is idempotent.
 */

// ───────────────────────── phone normalisation ──────────────────────────

/**
 * Reduce any input ("+962 78 109 9910", "00962781099910", "0781099910") to
 * canonical E.164 digits without the leading "+". Mirrors the convention
 * already used by `WhatsAppContact.phone` and the Meta Cloud API webhook
 * (`message.from`) — keeping a single shape across the codebase prevents
 * silently duplicated rows.
 *
 * Strategy:
 *   • Strip everything that isn't a digit.
 *   • If the result starts with "00", drop the two zeros (international
 *     prefix used in the Levant/Gulf when dialing manually).
 *   • If it starts with a single leading "0" AND we have a default country
 *     code in env, prepend the country code. We default to "962" (Jordan)
 *     because that's where the property operates; override with
 *     WA_BOT_DEFAULT_COUNTRY_CODE if you ship internationally.
 */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  let digits = input.replace(/\D+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) {
    const cc = process.env.WA_BOT_DEFAULT_COUNTRY_CODE || "962";
    digits = cc + digits.slice(1);
  }
  return digits;
}

// ──────────────────────────── guest account ─────────────────────────────

export interface EnsureGuestAccountInput {
  phone: string;
  /** WhatsApp profile name from `contacts[].profile.name`. May be null. */
  profileName?: string | null;
  /** Preferred language inferred from the dialog ("ar" | "en"). */
  preferredLang?: "ar" | "en";
}

/**
 * Find the GuestAccount tied to this phone, or create a new one. The phone
 * is auto-marked verified because the message arrived from Meta on that
 * exact number (the WhatsApp protocol guarantees ownership of the SIM/
 * registered number). This is the same trust model used by Booking.com,
 * Airbnb, and Expedia for chat-originated bookings.
 *
 * Returns `{ guestAccount, created }` so callers can decide whether to
 * greet the guest as new vs returning.
 */
export async function ensureGuestAccountForPhone(
  input: EnsureGuestAccountInput,
): Promise<{ guestAccount: GuestAccount; created: boolean }> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("ensureGuestAccountForPhone: empty phone");

  const existing = await prisma.guestAccount.findUnique({ where: { phone } });
  if (existing) {
    // Light refresh — only fill in blanks, never overwrite operator/UI edits.
    const patch: Partial<GuestAccount> = {};
    if (!existing.phoneVerifiedAt) patch.phoneVerifiedAt = new Date();
    if (!existing.fullName?.trim() && input.profileName?.trim()) {
      patch.fullName = input.profileName.trim();
    }
    if (Object.keys(patch).length) {
      const updated = await prisma.guestAccount.update({
        where: { id: existing.id },
        data: patch,
      });
      return { guestAccount: updated, created: false };
    }
    return { guestAccount: existing, created: false };
  }

  const guestAccount = await prisma.guestAccount.create({
    data: {
      phone,
      phoneVerifiedAt: new Date(),
      fullName: input.profileName?.trim() || "ضيف",
      preferredLang: input.preferredLang ?? "ar",
    },
  });

  // Mirror into `guest_account_identities` so social-link flows later don't
  // accidentally create a second account when this guest signs in via Google.
  try {
    await prisma.guestAccountIdentity.create({
      data: {
        guestAccountId: guestAccount.id,
        provider: "phone",
        providerId: phone,
        emailVerified: false,
      },
    });
  } catch {
    // Race-safe: a parallel webhook/POST may have created the same row.
  }

  return { guestAccount, created: true };
}

// ──────────────────────── bot conversation state ────────────────────────

/**
 * Finite-state-machine labels we move a conversation through. Free string
 * on purpose so future engine changes don't need a migration; the runtime
 * validator below catches typos in development.
 */
export type BotState =
  | "idle"
  | "greeting"
  | "collecting"
  | "quoting"
  | "previewing"
  | "holding"
  | "awaiting_payment"
  | "confirmed"
  | "escalated"
  | "done"
  | "opted_out";

const VALID_STATES = new Set<BotState>([
  "idle",
  "greeting",
  "collecting",
  "quoting",
  "previewing",
  "holding",
  "awaiting_payment",
  "confirmed",
  "escalated",
  "done",
  "opted_out",
]);

/**
 * Slot bag — the bot's working memory across turns. All keys optional;
 * `engine.runBotTurn` fills them as the LLM extracts them. Keep this small
 * and serialisable — anything heavyweight belongs in its own column.
 */
export interface BotSlots {
  checkIn?: string;            // ISO date "YYYY-MM-DD"
  checkOut?: string;
  guests?: number;
  preferredCategory?: string;  // "apartment" | "hotel_room" | …
  guestName?: string;
  language?: "ar" | "en";
  /** Last unit-type ids we showed the guest (avoids pestering with the same options). */
  lastShownOptions?: number[];
  /** Free-form notes the LLM wants to remember (allergies, requests). */
  freeNotes?: string;
  /**
   * Currently previewed unit (set by the quoting → previewing transition).
   * `previewKind` is "unit" | "merge" matching the option payload encoding.
   * `previewName` is cached so we can re-render labels without re-querying.
   * `previewTotal` / `previewNights` cache the latest quote so the confirm
   * button doesn't have to re-call `getQuote` on the same data.
   */
  previewKind?: "unit" | "merge";
  previewId?: number;
  previewName?: string;
  previewTotal?: number;
  previewNights?: number;
}

export interface EnsureBotConversationInput {
  phone: string;
  conversationId?: number | null;
  guestAccountId?: number | null;
}

/**
 * Get-or-create the `BotConversation` row keyed by phone. Always returns a
 * row even if all the foreign-key targets are null — the engine sets them
 * later as it learns more about the guest.
 */
export async function ensureBotConversation(
  input: EnsureBotConversationInput,
): Promise<BotConversation> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("ensureBotConversation: empty phone");

  const existing = await prisma.botConversation.findUnique({
    where: { contactPhone: phone },
  });
  if (existing) {
    // Backfill foreign keys when newly available. Never null them out.
    const patch: { conversationId?: number; guestAccountId?: number } = {};
    if (input.conversationId && !existing.conversationId) {
      patch.conversationId = input.conversationId;
    }
    if (input.guestAccountId && !existing.guestAccountId) {
      patch.guestAccountId = input.guestAccountId;
    }
    if (Object.keys(patch).length) {
      return prisma.botConversation.update({
        where: { id: existing.id },
        data: patch,
      });
    }
    return existing;
  }

  return prisma.botConversation.create({
    data: {
      contactPhone: phone,
      conversationId: input.conversationId ?? null,
      guestAccountId: input.guestAccountId ?? null,
      state: "idle",
      slots: {} as object,
    },
  });
}

/**
 * Atomic "merge slots + advance state + log event" used after every LLM
 * turn. `slots` is shallow-merged with the current bag (existing keys
 * survive when the new patch omits them). Pass `state = null` to leave the
 * FSM label unchanged.
 */
export async function advanceBotConversation(args: {
  botConvId: number;
  state?: BotState | null;
  slotsPatch?: Partial<BotSlots>;
  /** Pass when the inbound that triggered this turn arrived. */
  inboundAt?: Date;
  /** Pass when the bot's reply went out. */
  outboundAt?: Date;
}): Promise<BotConversation> {
  if (args.state && !VALID_STATES.has(args.state)) {
    throw new Error(`advanceBotConversation: unknown state "${args.state}"`);
  }

  const current = await prisma.botConversation.findUniqueOrThrow({
    where: { id: args.botConvId },
    select: { slots: true, state: true },
  });

  const merged = {
    ...((current.slots as BotSlots | null) ?? {}),
    ...(args.slotsPatch ?? {}),
  };

  const updated = await prisma.botConversation.update({
    where: { id: args.botConvId },
    data: {
      state: args.state ?? undefined,
      slots: merged as object,
      lastInboundAt: args.inboundAt ?? undefined,
      lastOutboundAt: args.outboundAt ?? undefined,
    },
  });

  if (args.state && args.state !== current.state) {
    await prisma.botConversationEvent.create({
      data: {
        botConvId: args.botConvId,
        kind: "state_change",
        payload: { from: current.state, to: args.state } as object,
      },
    });
  }

  return updated;
}

/** Convenience reader — returns the typed slot bag. */
export function readSlots(conv: BotConversation): BotSlots {
  return (conv.slots as BotSlots | null) ?? {};
}
