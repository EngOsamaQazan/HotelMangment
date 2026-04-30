import "server-only";
import type { BotConversation, GuestAccount } from "@prisma/client";

/**
 * Common shapes used across every booking tool.
 *
 * Design rules (read before adding a tool):
 *   • A tool MUST return either {ok: true, data} or {ok: false, error}. We
 *     never throw out of a tool — uncaught errors confuse the LLM and we
 *     want the engine to surface a clean retry/escalate signal.
 *   • Inputs are plain JSON-serialisable objects validated by the tool
 *     itself (project does not depend on zod). Validation failures are
 *     `{ok: false, error: { code: "bad_input", ... }}`.
 *   • A tool may mutate state on the BotConversation row (e.g. `lastHoldId`)
 *     so the engine stays consistent across LLM turns without forcing the
 *     model to thread state through tool arguments.
 *   • Each tool exports an OpenAI-style `jsonSchema` (Phase 3 wires this
 *     into the chat.completions `tools` array with `strict: true`).
 */

export interface ToolContext {
  botConv: BotConversation;
  guestAccount: GuestAccount | null;
  contactPhone: string;
  /** Profile name from WhatsApp — used as a fallback for guestName slots. */
  contactName: string | null;
  /** Wall-clock used for date math; injected so tests can pin a moment. */
  now: Date;
}

export type ToolError =
  | { code: "bad_input"; message: string; field?: string }
  | { code: "not_found"; message: string }
  | { code: "unavailable"; message: string }
  | { code: "race"; message: string }
  | { code: "rate_limited"; message: string }
  | { code: "provider_error"; message: string; provider?: string }
  | { code: "internal"; message: string };

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ToolError };

/** All tool names the engine knows about. Add new tools by extending here. */
export const TOOL_NAMES = [
  "searchAvailability",
  "getQuote",
  "createHold",
  "cancelHold",
  "createPaymentLink",
  "lookupReservation",
  "escalateToHuman",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * OpenAI / Anthropic-style JSON Schema for a tool. The shared shape lives in
 * `@/lib/llm/types` so both the WhatsApp bot and the staff assistant emit the
 * same structure to every adapter; here we just narrow the `name` field to
 * this engine's tool union for stronger autocomplete inside the bot module.
 */
import type { ToolJsonSchema as SharedToolJsonSchema } from "@/lib/llm/types";

export type ToolJsonSchema = SharedToolJsonSchema & { name: ToolName };

/** Convenience constructors so each tool file stays terse. */
export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function err(error: ToolError): { ok: false; error: ToolError } {
  return { ok: false, error };
}

// ───────────────────────── shared validators ─────────────────────────

/** "YYYY-MM-DD" → Date in UTC. Returns null on bad shape. */
export function parseISODate(input: unknown): Date | null {
  if (typeof input !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
