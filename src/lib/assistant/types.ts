import "server-only";
import type { ToolJsonSchema } from "@/lib/llm/types";

/**
 * Type system for the staff AI assistant. Mirrors the WhatsApp bot tools
 * surface but intentionally lives in its own module because:
 *   • The LLM is the same gpt-4o-mini, but the persona, prompt, and the
 *     tool catalogue are completely different (internal vs customer-facing).
 *   • The assistant ships **propose-only** write tools — they never mutate
 *     state directly; they enqueue an `AssistantAction` row that requires
 *     human confirmation before the executor runs.
 *
 * Adding a new tool checklist:
 *   1. Append the name to `ASSISTANT_TOOL_NAMES`.
 *   2. Implement it under `tools/<name>.ts` with `*Schema`, `*Input`,
 *      `*Output`, and a function `(input, ctx) => Promise<ToolResult<...>>`.
 *   3. Register it in `tools/index.ts` (REGISTRY + ALL_ASSISTANT_TOOLS).
 *   4. If it produces a draft action, add the new `kind` to
 *      `ASSISTANT_ACTION_KINDS` and a branch in `executor.ts`.
 */

export const ASSISTANT_TOOL_NAMES = [
  // ── Read tools — execute immediately ────────────────────────────────
  "searchAccount",
  "searchParty",
  "searchCostCenter",
  "searchUnit",
  "listAvailableUnits",
  "getPartyBalance",
  "listOpenReservations",
  "getGuestProfile",
  "runSqlQuery",
  // ── Propose tools — enqueue an AssistantAction draft only ───────────
  "proposeJournalEntry",
  "proposeReservation",
  "proposeMaintenanceRequest",
  "proposeTaskCard",
  "proposePayrollAdvance",
  "proposeUnitStatusChange",
  /**
   * Generic propose-anything tool. Combined with the WRITABLE_RESOURCES
   * registry it gives the assistant CRUD-like authority on every
   * (target, operation) pair the admin has wired up. Specialised propose
   * tools above remain preferred for high-volume flows because their
   * argument schemas are tighter and easier for the model to fill.
   */
  "proposeChange",
] as const;

export type AssistantToolName = (typeof ASSISTANT_TOOL_NAMES)[number];

export const ASSISTANT_ACTION_KINDS = [
  "journal_entry",
  "reservation_create",
  "maintenance_create",
  "task_create",
  "payroll_advance",
  "unit_status_change",
  "generic_change",
] as const;

export type AssistantActionKind = (typeof ASSISTANT_ACTION_KINDS)[number];

/**
 * Per-tool metadata used by the engine. `requiredPermission` is the SINGLE
 * source of truth for the tool-gating layer: tools whose permission the
 * caller does NOT hold are filtered out **before** the schemas are sent to
 * the LLM, so the model literally cannot propose the operation. The
 * executor performs an additional `requirePermission()` check at runtime
 * for defence in depth.
 */
export interface AssistantToolDef {
  name: AssistantToolName;
  schema: ToolJsonSchema;
  /** Required permission key (`null` = always available, e.g. read tools). */
  requiredPermission: string | null;
  /** "read" returns data inline; "propose" creates an `AssistantAction`. */
  kind: "read" | "propose";
}

export interface AssistantToolContext {
  /** Authenticated staff member running the conversation. */
  userId: number;
  /** Snapshot of the user's permission set at turn start. */
  userPermissions: ReadonlySet<string>;
  /** The conversation row driving this turn. */
  conversationId: number;
  /** Wall-clock used for date math; injected so tests can pin a moment. */
  now: Date;
}

export type AssistantToolError =
  | { code: "bad_input"; message: string; field?: string }
  | { code: "not_found"; message: string }
  | { code: "forbidden"; message: string }
  | { code: "unbalanced"; message: string }
  | { code: "internal"; message: string };

export type AssistantToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AssistantToolError };

/** Convenience helpers so each tool stays terse. */
export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function err(error: AssistantToolError): { ok: false; error: AssistantToolError } {
  return { ok: false, error };
}

/**
 * Standard payload returned by every `proposeXxx` tool — the LLM sees this
 * back as a tool result and the UI re-fetches the full `AssistantAction`
 * by id to render the confirmation card.
 */
export interface ProposedActionPayload {
  actionId: number;
  kind: AssistantActionKind;
  summary: string;
  expiresAt: string;
}
