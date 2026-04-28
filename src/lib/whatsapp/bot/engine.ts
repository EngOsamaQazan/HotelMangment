import "server-only";
import { prisma } from "@/lib/prisma";
import type { BotConversation, GuestAccount } from "@prisma/client";
import { getLLMProvider } from "@/lib/llm";
import type { ChatMessage, LLMProvider, ToolCall } from "@/lib/llm";
import {
  ALL_TOOL_SCHEMAS,
  runTool,
  type ToolContext,
  type ToolName,
} from "./tools";
import { ensureBotConversation, ensureGuestAccountForPhone, normalizePhone } from "./identity";
import { buildSystemPrompt, sanitizeUserText, wrapUserText } from "./prompt";
import { runFallbackTurn } from "./fallback";
import { sendHumanlikeText } from "./humanize";
import { maybeApplyOptOut } from "./compliance";

/**
 * The brain. One call to `runBotTurn` consumes one inbound WhatsApp message
 * and either:
 *
 *   • Walks the LLM through up to MAX_TOOL_HOPS rounds of tool-calling, then
 *     sends the model's natural-language reply via the bot sender, OR
 *   • Falls back to the deterministic rule-based dialog (fallback.ts) when
 *     the LLM is unconfigured / over-budget / has tripped a circuit breaker.
 *
 * State updates are atomic per turn — we always finish a turn with a row
 * commit so a crash mid-loop never leaves a half-state dialog.
 */

const MAX_TOOL_HOPS_DEFAULT = 5;
const MAX_HISTORY_TURNS_DEFAULT = 12;

export interface RunBotTurnInput {
  /** Raw E.164 (no plus) — same shape used by the WhatsApp webhook. */
  phone: string;
  /** WhatsApp profile name for greeting personalisation; null when missing. */
  contactName: string | null;
  /** The inbound message body (text, "id|title" for interactive, null otherwise). */
  inboundBody: string | null;
  /** "text" | "interactive" | "image" | … — same string used in WhatsAppMessage.type. */
  inboundType: string;
  /** When the inbound arrived — used for state timestamps. */
  inboundAt: Date;
  /** WhatsAppConversation.id when known; some webhooks may not have it yet. */
  conversationId?: number | null;
}

export interface RunBotTurnResult {
  /** "llm" | "fallback" | "skipped" — used by the gateway for analytics. */
  mode: "llm" | "fallback" | "skipped";
  /** Bot conversation row id (created if new). */
  botConvId: number | null;
  /** True when the bot actually sent at least one message to the guest. */
  replied: boolean;
  /** Error string when the turn aborted abnormally. */
  error?: string;
}

export async function runBotTurn(input: RunBotTurnInput): Promise<RunBotTurnResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { mode: "skipped", botConvId: null, replied: false };

  // ── 1. Identity provisioning ────────────────────────────────────────
  const { guestAccount } = await ensureGuestAccountForPhone({
    phone,
    profileName: input.contactName,
  });
  const botConv = await ensureBotConversation({
    phone,
    conversationId: input.conversationId ?? null,
    guestAccountId: guestAccount.id,
  });

  // Persist the inbound itself so the next turn can replay it from history.
  await prisma.botConversationEvent.create({
    data: {
      botConvId: botConv.id,
      kind: "user_msg",
      payload: {
        type: input.inboundType,
        body: input.inboundBody,
        receivedAt: input.inboundAt.toISOString(),
      } as object,
    },
  });

  await prisma.botConversation.update({
    where: { id: botConv.id },
    data: { lastInboundAt: input.inboundAt },
  });

  // Compliance short-circuit: opt-out keywords always win, before LLM cost.
  const optedOut = await maybeApplyOptOut({
    phone,
    body: input.inboundType === "text" ? input.inboundBody : null,
    botConvId: botConv.id,
  });
  if (optedOut) {
    return { mode: "skipped", botConvId: botConv.id, replied: true };
  }

  const ctx: ToolContext = {
    botConv,
    guestAccount,
    contactPhone: phone,
    contactName: input.contactName,
    now: input.inboundAt,
  };

  // ── 2. Provider selection ───────────────────────────────────────────
  const provider = await getLLMProvider();
  if (!provider) {
    await runFallbackTurn({
      phone,
      body: input.inboundBody,
      type: input.inboundType,
      ctx,
    });
    return { mode: "fallback", botConvId: botConv.id, replied: true };
  }

  // ── 3. LLM tool-calling loop ────────────────────────────────────────
  try {
    const replied = await runLlmDialog({
      provider,
      ctx,
      input,
    });
    return {
      mode: "llm",
      botConvId: botConv.id,
      replied,
    };
  } catch (e) {
    console.error("[bot/engine] LLM turn failed — falling back", e);
    // Fallback so the guest never gets silence.
    await runFallbackTurn({
      phone,
      body: input.inboundBody,
      type: input.inboundType,
      ctx,
    });
    return {
      mode: "fallback",
      botConvId: botConv.id,
      replied: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─────────────────────── internal: history rebuild ──────────────────────

/**
 * Reconstruct the OpenAI-style message array from `BotConversationEvent`s.
 * We only keep the last N user+assistant turn-pairs so the prompt stays
 * cheap and inside any provider context window.
 */
async function buildMessageHistory(
  botConv: BotConversation,
  maxTurns: number,
): Promise<ChatMessage[]> {
  const limit = Math.max(2, maxTurns) * 4; // generous cap (each turn ≈ user+assistant+tool*2)
  const events = await prisma.botConversationEvent.findMany({
    where: { botConvId: botConv.id, kind: { in: ["user_msg", "bot_msg", "tool_call", "tool_result"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const messages: ChatMessage[] = [];
  for (const ev of events) {
    const p = ev.payload as Record<string, unknown> | null;
    if (!p) continue;
    if (ev.kind === "user_msg") {
      const body = (p.body as string | null | undefined) ?? "";
      messages.push({ role: "user", content: wrapUserText(body) });
    } else if (ev.kind === "bot_msg") {
      const text = (p.text as string | null | undefined) ?? "";
      const calls = Array.isArray(p.toolCalls) ? (p.toolCalls as ToolCall[]) : undefined;
      messages.push({
        role: "assistant",
        content: text,
        ...(calls?.length ? { toolCalls: calls } : {}),
      });
    } else if (ev.kind === "tool_call") {
      // Skip — tool_call rows are mirrored on the assistant message above.
    } else if (ev.kind === "tool_result") {
      const callId = String(p.toolCallId ?? "");
      const name = String(p.toolName ?? "");
      const content = JSON.stringify(p.result ?? null);
      if (!callId || !name) continue;
      messages.push({
        role: "tool",
        toolCallId: callId,
        toolName: name as ToolName,
        content,
      });
    }
  }
  return messages;
}

// ───────────────────── internal: the LLM dialog loop ────────────────────

interface RunLlmDialogArgs {
  provider: LLMProvider;
  ctx: ToolContext;
  input: RunBotTurnInput;
}

async function runLlmDialog(args: RunLlmDialogArgs): Promise<boolean> {
  const { provider, ctx, input } = args;
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg) {
    console.warn("[bot/engine] no WhatsAppConfig — aborting LLM turn");
    return false;
  }

  const maxHops = cfg.botMaxToolHops || MAX_TOOL_HOPS_DEFAULT;
  const maxTurns = cfg.botMaxTurns || MAX_HISTORY_TURNS_DEFAULT;

  // Build the prompt + replay the dialog so the model has context.
  const system = buildSystemPrompt({
    cfg: {
      botPersonaName: cfg.botPersonaName,
      botPersonaTone: cfg.botPersonaTone,
      botPaymentCurrency: cfg.botPaymentCurrency,
      displayPhoneNumber: cfg.displayPhoneNumber,
    },
    botConv: ctx.botConv,
    guestName: ctx.guestAccount?.fullName ?? ctx.contactName,
  });

  const messages = await buildMessageHistory(ctx.botConv, maxTurns);
  // Append the inbound message as the latest turn.
  messages.push({
    role: "user",
    content: wrapUserText(sanitizeUserText(input.inboundBody ?? "")),
  });

  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let replied = false;
  const conversationToolCalls: ToolCall[] = [];

  for (let hop = 0; hop < maxHops; hop++) {
    const llmResp = await provider.chat({
      system,
      messages,
      tools: ALL_TOOL_SCHEMAS,
      strictTools: true,
      temperature: 0.3,
    });

    totalCost += llmResp.usage.costUsd;
    totalTokensIn += llmResp.usage.promptTokens;
    totalTokensOut += llmResp.usage.completionTokens;

    if (llmResp.toolCalls.length > 0) {
      // Persist the assistant's tool-call announcement first so history
      // ordering is correct on the next turn.
      await prisma.botConversationEvent.create({
        data: {
          botConvId: ctx.botConv.id,
          kind: "bot_msg",
          payload: {
            text: llmResp.text ?? "",
            toolCalls: llmResp.toolCalls,
            usage: llmResp.usage,
          } as object,
        },
      });
      messages.push({
        role: "assistant",
        content: llmResp.text,
        toolCalls: llmResp.toolCalls,
      });
      conversationToolCalls.push(...llmResp.toolCalls);

      // Execute each tool sequentially and feed results back to the model.
      for (const call of llmResp.toolCalls) {
        let parsedArgs: unknown = {};
        try {
          parsedArgs = JSON.parse(call.argumentsJson || "{}");
        } catch {
          parsedArgs = {};
        }
        const result = await runTool(call.name, parsedArgs, ctx);
        await prisma.botConversationEvent.create({
          data: {
            botConvId: ctx.botConv.id,
            kind: "tool_result",
            payload: {
              toolCallId: call.id,
              toolName: call.name,
              args: parsedArgs as object,
              result: result as object,
            } as object,
          },
        });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result),
        });
      }
      // Loop again — the model may want to call more tools or finalise.
      continue;
    }

    // No tool calls → the model gave us a final reply. Send it with
    // humanlike pacing (split + delays) when enabled.
    const text = (llmResp.text ?? "").trim();
    if (text) {
      await sendHumanlikeText({
        to: ctx.contactPhone,
        text,
        pace: cfg.botHumanlikePacing,
        origin: "bot:llm",
      });
      await prisma.botConversationEvent.create({
        data: {
          botConvId: ctx.botConv.id,
          kind: "bot_msg",
          payload: {
            text,
            usage: llmResp.usage,
            finishReason: llmResp.finishReason,
          } as object,
        },
      });
      replied = true;
    }
    break;
  }

  // Persist accumulated cost + token counters in one update.
  await prisma.botConversation.update({
    where: { id: ctx.botConv.id },
    data: {
      llmTurns: { increment: 1 },
      llmTokensIn: { increment: totalTokensIn },
      llmTokensOut: { increment: totalTokensOut },
      costUsd: { increment: totalCost },
      lastOutboundAt: replied ? new Date() : ctx.botConv.lastOutboundAt,
    },
  });

  // Daily budget bookkeeping (circuit breaker for Phase 4).
  await bumpDailyBudget(totalCost);

  return replied;
}

async function bumpDailyBudget(deltaUsd: number): Promise<void> {
  if (deltaUsd <= 0) return;
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: { botCostTodayUsd: true, botCostResetAt: true },
  });
  const now = new Date();
  const isNewDay =
    !cfg?.botCostResetAt ||
    now.getUTCFullYear() !== cfg.botCostResetAt.getUTCFullYear() ||
    now.getUTCMonth() !== cfg.botCostResetAt.getUTCMonth() ||
    now.getUTCDate() !== cfg.botCostResetAt.getUTCDate();

  await prisma.whatsAppConfig.update({
    where: { id: 1 },
    data: isNewDay
      ? {
          botCostTodayUsd: deltaUsd,
          botCostResetAt: now,
        }
      : { botCostTodayUsd: { increment: deltaUsd } },
  });
}
