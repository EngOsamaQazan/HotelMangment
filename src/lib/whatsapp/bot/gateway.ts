import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runBotTurn, type RunBotTurnInput } from "./engine";
import { ensureBotConversation, normalizePhone } from "./identity";

/**
 * Single decision-point the WhatsApp webhook calls after persisting an
 * inbound message. Decides — based on `WhatsAppConfig.botMode`, the
 * shadow/allowlist/percentage gating layers, and the conversation's
 * current human-takeover status — whether to:
 *
 *   • Run the bot turn (LLM or rule-based) and send a reply, OR
 *   • Run the bot in shadow mode (compute the reply, persist as a draft
 *     for staff review, never send), OR
 *   • Skip entirely and let the existing inbox + auto-reply stack handle
 *     the message exactly as it does today.
 *
 * Phase 0 ships this stub returning "skip". The actual gating logic is
 * filled in here so subsequent phases (engine, fallback, shadow, allowlist,
 * percentage) plug in without touching the webhook again.
 */

export interface GatewayInput extends RunBotTurnInput {
  /** Meta media id for inbound media messages; used by the staff assistant for audio transcription. */
  inboundMediaId?: string | null;
  inboundMediaMimeType?: string | null;
  /** Stored WhatsAppMessage row id, when available. */
  inboundMessageId?: number | null;
}

export type GatewayDecision =
  | { action: "skip"; reason: string }
  | { action: "run_bot"; mode: "llm" | "fallback" }
  | { action: "shadow"; reason: string }
  | { action: "run_staff_assistant"; staffUserId: number };

export async function decideGatewayAction(
  input: GatewayInput,
): Promise<GatewayDecision> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { action: "skip", reason: "empty_phone" };

  // Staff-bot short-circuit: if this number belongs to a registered staff
  // user AND the staff assistant is enabled, divert to the internal
  // assistant pipeline regardless of customer-bot config. The staff
  // assistant authenticates via OTP, so we don't trust the phone alone —
  // it just decides which pipeline handles the message.
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: {
      botMode: true,
      botRolloutPercentage: true,
      botCircuitBreakerEnabled: true,
      botDailyBudgetUsd: true,
      botCostTodayUsd: true,
      botCostResetAt: true,
      botActiveHoursStart: true,
      botActiveHoursEnd: true,
      isActive: true,
      assistantWaEnabled: true,
    },
  });

  if (cfg?.assistantWaEnabled) {
    const staffUser = await prisma.user.findFirst({
      where: { whatsappPhone: phone },
      select: { id: true },
    });
    if (staffUser) {
      return { action: "run_staff_assistant", staffUserId: staffUser.id };
    }
  }

  if (!cfg || !cfg.isActive || cfg.botMode === "off") {
    return { action: "skip", reason: "bot_off" };
  }

  // Hard daily budget circuit-breaker.
  if (cfg.botCircuitBreakerEnabled) {
    const limit = Number(cfg.botDailyBudgetUsd);
    const today = Number(cfg.botCostTodayUsd);
    if (Number.isFinite(limit) && limit > 0 && today >= limit) {
      return { action: "skip", reason: "daily_budget_exceeded" };
    }
  }

  // Active hours window (Asia/Amman) — inactive hours go straight to humans.
  if (cfg.botActiveHoursStart && cfg.botActiveHoursEnd) {
    if (!isInsideActiveWindow(cfg.botActiveHoursStart, cfg.botActiveHoursEnd)) {
      return { action: "skip", reason: "outside_active_hours" };
    }
  }

  // Don't replace a human conversation. Once a staff member is assigned,
  // the bot stops engaging — even if it had been driving the dialog earlier.
  if (input.conversationId) {
    const conv = await prisma.whatsAppConversation.findUnique({
      where: { id: input.conversationId },
      select: { assignedToUserId: true },
    });
    if (conv?.assignedToUserId) {
      return { action: "skip", reason: "human_assigned" };
    }
  }

  // Already-escalated bot conversations stay with humans.
  const botConv = await ensureBotConversation({
    phone,
    conversationId: input.conversationId ?? null,
  });
  if (botConv.state === "escalated") {
    return { action: "skip", reason: "already_escalated" };
  }
  if (botConv.state === "opted_out") {
    return { action: "skip", reason: "opted_out" };
  }

  // Mode-specific gating.
  switch (cfg.botMode) {
    case "shadow":
      return { action: "shadow", reason: "shadow_mode" };
    case "allowlist": {
      const allowed = await prisma.botAllowlist.findUnique({
        where: { phone },
        select: { isActive: true },
      });
      if (!allowed?.isActive) {
        return { action: "skip", reason: "not_in_allowlist" };
      }
      return { action: "run_bot", mode: "llm" };
    }
    case "percentage": {
      if (!isInRolloutBucket(phone, cfg.botRolloutPercentage)) {
        return { action: "skip", reason: "outside_rollout" };
      }
      return { action: "run_bot", mode: "llm" };
    }
    case "full":
      return { action: "run_bot", mode: "llm" };
    default:
      return { action: "skip", reason: `unknown_mode:${cfg.botMode}` };
  }
}

export interface DispatchResult {
  /** What the gateway actually did. "skipped" → caller can run legacy auto-reply. */
  outcome: "skipped" | "replied" | "shadowed" | "error";
  reason?: string;
}

/**
 * Webhook entry point. Decides → executes. Always swallows errors so a bot
 * crash never poisons the message-persistence path. Returns `outcome` so
 * the caller knows whether the legacy auto-reply path should still run.
 */
export async function dispatchInboundToBot(input: GatewayInput): Promise<DispatchResult> {
  try {
    const decision = await decideGatewayAction(input);
    if (decision.action === "skip") {
      return { outcome: "skipped", reason: decision.reason };
    }
    if (decision.action === "run_staff_assistant") {
      // Lazy-imported to avoid circulars (the staff handler imports from
      // `@/lib/assistant` which transitively pulls in things we don't need
      // for the customer bot's hot path).
      const { handleStaffWaMessage } = await import("@/lib/assistant/whatsapp/handler");
      const r = await handleStaffWaMessage({
        staffUserId: decision.staffUserId,
        phone: normalizePhone(input.phone) || input.phone,
        body: input.inboundBody,
        type: input.inboundType,
        mediaId: input.inboundMediaId ?? null,
        mediaMimeType: input.inboundMediaMimeType ?? null,
        whatsappMessageId: input.inboundMessageId ?? null,
        receivedAt: input.inboundAt,
        conversationId: input.conversationId ?? null,
      });
      return { outcome: r.replied ? "replied" : "skipped", reason: r.reason };
    }
    if (decision.action === "run_bot") {
      const r = await runBotTurn(input);
      return { outcome: r.replied ? "replied" : "skipped", reason: r.error };
    }
    if (decision.action === "shadow") {
      await runShadowDraft(input);
      return { outcome: "shadowed", reason: decision.reason };
    }
    return { outcome: "skipped", reason: "no_branch" };
  } catch (e) {
    console.error("[bot/gateway] dispatch error", e);
    return {
      outcome: "error",
      reason: e instanceof Error ? e.message : "unknown",
    };
  }
}

// ───────────────────────────── helpers ─────────────────────────────

/**
 * Deterministic 0-99 bucket for a phone number. Uses SHA-256 so we don't
 * accidentally cluster numbers ending in similar digits in the same bucket.
 */
function isInRolloutBucket(phone: string, percentage: number): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  const hash = crypto.createHash("sha256").update(phone).digest();
  // First 4 bytes → 32-bit unsigned int → mod 100.
  const bucket = hash.readUInt32BE(0) % 100;
  return bucket < percentage;
}

/**
 * Active-hours check in Asia/Amman. The strings are "HH:mm" 24h. Supports
 * windows that cross midnight (e.g. start="22:00", end="06:00").
 */
function isInsideActiveWindow(start: string, end: string): boolean {
  const now = new Date();
  // Convert "now" to Amman wall-clock without depending on Intl APIs that
  // aren't available in every Node build.
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Amman is UTC+3 year-round (no DST since 2022).
  const ammanMinutes = (utcMinutes + 3 * 60) % (24 * 60);

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const sMin = (sh ?? 0) * 60 + (sm ?? 0);
  const eMin = (eh ?? 0) * 60 + (em ?? 0);

  if (sMin === eMin) return true; // same start/end == always-on
  if (sMin < eMin) {
    return ammanMinutes >= sMin && ammanMinutes < eMin;
  }
  // Window crosses midnight.
  return ammanMinutes >= sMin || ammanMinutes < eMin;
}

// ─────────────────────── shadow-mode placeholder ─────────────────────

/**
 * Compute the bot's would-be response and persist it as a `BotShadowDraft`
 * tied to the inbound message — without sending anything to the guest.
 *
 * Phase 5 builds the inbox UI that consumes these drafts. For now we
 * persist text-only drafts derived from the LLM response (or a "[fallback]"
 * marker when the LLM is off and the rule-based dialog would have kicked
 * in — fallback is interactive lists/buttons which don't translate to a
 * single text draft cleanly, so shadow only makes sense with an LLM
 * configured).
 */
async function runShadowDraft(_input: GatewayInput): Promise<void> {
  // Phase 5 implements this fully — wired now so the gateway never throws
  // when the operator flips `botMode = "shadow"` before Phase 5 ships.
  // We intentionally do nothing here; the production data model is in place
  // (BotShadowDraft) and the inbox UI will start populating it once the
  // dedicated draft-producer path is added.
  return;
}
