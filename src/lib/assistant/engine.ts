import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getLLMProvider } from "@/lib/llm";
import type { ChatMessage, LLMProvider, ToolCall } from "@/lib/llm";
import { getUserPermissions } from "@/lib/permissions/guard";
import { buildAssistantSystemPrompt } from "./prompt";
import { loadHelpDocs } from "./help-docs";
import { sanitizeUserText, wrapUserText } from "@/lib/whatsapp/bot/prompt";
import { filterToolsByPermissions, runAssistantTool } from "./tools";
import type { AssistantToolContext } from "./types";
import { detectApology, classifyFailure } from "./learning/detect";
import { formatLessonsForPrompt, loadActiveLessons } from "./learning/lessons-loader";

const MAX_TOOL_HOPS = 8;
const MAX_HISTORY_MESSAGES = 40;
/** Single nudge that prepends to the message list when the model is about to apologise. */
const REFLECTION_NUDGE =
  "قبل أن تعتذر للموظف: راجع كل أدوات القراءة المتاحة لك (خصوصاً getGuestProfile, runSqlQuery, searchParty, searchUnit, listOpenReservations). إذا توجد أداة لم تجرّبها قد تجلب الجواب — استدعِها الآن بمدخلات مختلفة. لا تعتذر إلا بعد استنفاد كل أداة قد تساعد. ممنوع تكرار نفس الأداة بنفس المدخلات. لو حقاً لا توجد أداة تساعد، اشرح للموظف بدقة أيّ بيانات تنقصك ليجدها.";

export interface AssistantTurnInput {
  conversationId: number;
  userId: number;
  staffName: string;
  /** Raw text typed by the user — sanitised before being added to history. */
  userMessage: string;
  /** Wall-clock injected for testability. */
  now?: Date;
  /**
   * Page-level context forwarded by the floating FAB so the assistant can
   * answer "how do I do X here?" with screen-specific guidance instead of
   * generic answers. Optional — when null, the prompt falls back to the
   * standard system message.
   */
  pageContext?: { path: string; title: string | null } | null;
}

/** One row of the per-turn tools-tried log used by the failure-capture branch. */
interface ToolAttempt {
  name: string;
  argumentsJson: string;
  ok: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AssistantTurnResult {
  /** Final assistant text shown to the staff after the turn. */
  text: string;
  /** Action draft IDs created during this turn (so the UI can fetch them). */
  pendingActionIds: number[];
  /** USD cost incurred by this turn. */
  costUsd: number;
  /** "llm" when the model handled it; "no_provider" when the LLM is unconfigured;
   *  "budget_exhausted" when the daily budget is spent. */
  mode: "llm" | "no_provider" | "budget_exhausted" | "error";
  error?: string;
}

/**
 * Run a single conversation turn:
 *   1. Persist the user's message.
 *   2. Build the message history + system prompt with permission-filtered tools.
 *   3. Loop the LLM through tool calls (read tools execute live; propose
 *      tools enqueue `AssistantAction` rows).
 *   4. Persist the final assistant text and update conversation totals.
 *
 * The function never throws — it always returns a `AssistantTurnResult` so
 * the API route can render a friendly card even on provider failures.
 */
export async function runAssistantTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
  const now = input.now ?? new Date();
  const sanitisedUser = sanitizeUserText(input.userMessage);
  if (!sanitisedUser) {
    return { text: "لم أستلم نصاً واضحاً. هل يمكن أن تعيد كتابة طلبك؟", pendingActionIds: [], costUsd: 0, mode: "error" };
  }

  // Persist the user's message immediately so the chat sidebar refreshes.
  await prisma.assistantMessage.create({
    data: {
      conversationId: input.conversationId,
      role: "user",
      content: sanitisedUser,
    },
  });
  await prisma.assistantConversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: now },
  });

  // ── Budget check ────────────────────────────────────────────────────
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: {
      assistantEnabled: true,
      assistantDailyBudgetUsd: true,
      assistantCostTodayUsd: true,
      assistantCostResetAt: true,
    },
  });
  if (cfg && !cfg.assistantEnabled) {
    return persistAssistantText(
      input.conversationId,
      "المساعد الذكي معطّل من إعدادات النظام. تواصل مع المدير لتفعيله.",
      [],
      0,
      "no_provider",
    );
  }
  if (cfg && isBudgetExhausted(cfg, now)) {
    return persistAssistantText(
      input.conversationId,
      "نفدت الميزانية اليومية للمساعد. الرجاء تنفيذ العملية يدوياً أو زيادة الميزانية من إعدادات النظام.",
      [],
      0,
      "budget_exhausted",
    );
  }

  // ── Provider ────────────────────────────────────────────────────────
  const provider = await getLLMProvider();
  if (!provider) {
    return persistAssistantText(
      input.conversationId,
      "لم يتم ضبط مزوّد ذكاء اصطناعي بعد. اطلب من المدير إدخال مفتاح OpenAI من /settings/whatsapp/bot.",
      [],
      0,
      "no_provider",
    );
  }

  // ── Tool gating (permissions layer 2) ───────────────────────────────
  const userPerms = await getUserPermissions(input.userId);
  const tools = filterToolsByPermissions(userPerms);
  const toolSchemas = tools.map((t) => t.schema);
  const ctx: AssistantToolContext = {
    userId: input.userId,
    userPermissions: userPerms,
    conversationId: input.conversationId,
    now,
  };

  // Resolve the speaker's accounting identity. Three-step fallback:
  //   1. Formal `Party.userId` 1:1 link — set up via /accounting/parties
  //      or the seed script. Most reliable.
  //   2. Best-effort exact-name match against `Party.name` ≈ `User.name`.
  //      Used when the admin hasn't wired the link yet — saves the staff
  //      from having to identify themselves on every turn.
  //   3. null → prompt asks the user to clarify.
  let speakerParty = await prisma.party.findUnique({
    where: { userId: input.userId },
    select: {
      id: true,
      name: true,
      type: true,
      apAccountId: true,
      equityAccountId: true,
      drawAccountId: true,
    },
  });
  if (!speakerParty && input.staffName) {
    // Reuse the same Arabic folding used by `searchParty` — see
    // src/lib/assistant/arabic.ts.
    const { normalizeArabic } = await import("./arabic");
    const folded = normalizeArabic(input.staffName);
    if (folded) {
      const candidates = await prisma.party.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          apAccountId: true,
          equityAccountId: true,
          drawAccountId: true,
        },
      });
      const match = candidates.find((p) => normalizeArabic(p.name) === folded);
      if (match) speakerParty = match;
    }
  }

  // Pull admin-approved lessons relevant to this turn. Errors here are
  // never fatal — we log and proceed without the memory section.
  let lessonsBlock = "";
  try {
    const lessons = await loadActiveLessons(sanitisedUser, now);
    lessonsBlock = formatLessonsForPrompt(lessons);
  } catch (e) {
    console.warn("[assistant/engine] lessons-loader failed", e);
  }

  const todayIso = now.toISOString().slice(0, 10);
  const system = buildAssistantSystemPrompt({
    staffName: input.staffName,
    permissions: userPerms,
    availableTools: tools,
    todayIso,
    speakerParty,
    pageContext: input.pageContext ?? null,
    helpDocs: await loadHelpDocs(),
    lessonsBlock,
  });

  // ── Replay history ──────────────────────────────────────────────────
  const messages = await replayHistory(input.conversationId);

  // Track every tool the model has called this turn (and outcome) so we
  // can both feed it to the lesson-drafter on failure and detect when the
  // model apologises without trying anything ("hallucinated" tag).
  const toolsTried: ToolAttempt[] = [];
  // Track the AssistantMessage row we created for the user's input — the
  // FK on AssistantFailure points back to it for traceability.
  const userMessageRow = await prisma.assistantMessage.findFirst({
    where: { conversationId: input.conversationId, role: "user" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  let reflectionApplied = false;

  // ── Tool-calling loop ───────────────────────────────────────────────
  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const pendingActionIds: number[] = [];
  let finalText = "";

  try {
    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const resp = await callProvider(provider, system, messages, toolSchemas);
      totalCost += resp.usage.costUsd;
      totalTokensIn += resp.usage.promptTokens;
      totalTokensOut += resp.usage.completionTokens;

      if (resp.toolCalls.length > 0) {
        // Persist the assistant's tool_call announcement.
        await prisma.assistantMessage.create({
          data: {
            conversationId: input.conversationId,
            role: "assistant",
            content: resp.text ?? "",
            toolCalls: resp.toolCalls as unknown as Prisma.InputJsonValue,
            usage: resp.usage as unknown as Prisma.InputJsonValue,
          },
        });
        messages.push({
          role: "assistant",
          content: resp.text,
          toolCalls: resp.toolCalls,
        });

        for (const call of resp.toolCalls) {
          let parsed: unknown = {};
          try {
            parsed = JSON.parse(call.argumentsJson || "{}");
          } catch {
            parsed = {};
          }
          const result = await runAssistantTool(call.name, parsed, ctx);
          toolsTried.push({
            name: call.name,
            argumentsJson: call.argumentsJson ?? "",
            ok: result.ok === true,
            errorCode: result.ok ? null : result.error?.code ?? null,
            errorMessage: result.ok ? null : result.error?.message ?? null,
          });

          // Track newly created drafts so the UI can render confirmation cards.
          if (result.ok && result.data && typeof result.data === "object" && "actionId" in (result.data as object)) {
            const aid = (result.data as { actionId?: number }).actionId;
            if (typeof aid === "number") pendingActionIds.push(aid);
          }

          await prisma.assistantMessage.create({
            data: {
              conversationId: input.conversationId,
              role: "tool",
              content: JSON.stringify(result),
              toolCallId: call.id,
              toolName: call.name,
            },
          });
          messages.push({
            role: "tool",
            toolCallId: call.id,
            toolName: call.name,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      // No more tool calls — candidate final reply. Before persisting it,
      // check whether the model is about to apologise. If yes, give it
      // exactly ONE reflection retry hop with a strong nudge to try
      // unused tools first. This is the "self-correct" step.
      const candidate = (resp.text ?? "").trim();
      if (!reflectionApplied && detectApology(candidate).isApology) {
        reflectionApplied = true;
        // We do NOT persist the apology candidate — it never leaves the
        // engine. Instead we append a synthetic user nudge to the in-memory
        // history and loop. The nudge is wrapped as a user message so the
        // model treats it as a higher-priority instruction than its own
        // last assistant turn.
        messages.push({ role: "user", content: REFLECTION_NUDGE });
        // Also persist the assistant text we got (so the audit trail is
        // complete) but tagged so the UI can hide it.
        await prisma.assistantMessage.create({
          data: {
            conversationId: input.conversationId,
            role: "assistant",
            content: candidate,
            toolCalls: [{ id: "_reflection_skipped", name: "_reflection", argumentsJson: "{}" }] as unknown as Prisma.InputJsonValue,
            usage: resp.usage as unknown as Prisma.InputJsonValue,
          },
        });
        messages.push({ role: "assistant", content: candidate });
        continue;
      }

      finalText = candidate;
      await prisma.assistantMessage.create({
        data: {
          conversationId: input.conversationId,
          role: "assistant",
          content: finalText,
          usage: resp.usage as unknown as Prisma.InputJsonValue,
        },
      });
      break;
    }

    if (!finalText) {
      finalText = "تم تحضير ما طلبت. راجع المسودة أعلاه واضغط تأكيد للتنفيذ.";
    }

    // Failure capture: if reflection still ended in an apology, record
    // a row for the admin inbox to learn from. Best-effort — we never let
    // this fail the user-facing turn.
    try {
      const detection = detectApology(finalText);
      if (detection.isApology) {
        const tags = classifyFailure(detection, toolsTried);
        await prisma.assistantFailure.create({
          data: {
            conversationId: input.conversationId,
            userMessageId: userMessageRow?.id ?? null,
            userText: sanitisedUser,
            assistantReply: finalText,
            toolsTried: toolsTried as unknown as Prisma.InputJsonValue,
            pageContext: input.pageContext
              ? ({ path: input.pageContext.path, title: input.pageContext.title } as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            tagsJson: tags as unknown as Prisma.InputJsonValue,
          },
        });
      }
    } catch (e) {
      console.warn("[assistant/engine] failed to record AssistantFailure", e);
    }
  } catch (e) {
    console.error("[assistant/engine] turn failed", e);
    const msg = e instanceof Error ? e.message : "خطأ داخلي.";
    await prisma.assistantMessage.create({
      data: {
        conversationId: input.conversationId,
        role: "assistant",
        content: `تعذّر إكمال طلبك: ${msg}`,
      },
    });
    await bumpAssistantBudget(totalCost, now);
    await bumpConversationCounters(input.conversationId, totalCost, totalTokensIn, totalTokensOut);
    return {
      text: `تعذّر إكمال طلبك: ${msg}`,
      pendingActionIds,
      costUsd: totalCost,
      mode: "error",
      error: msg,
    };
  }

  await bumpAssistantBudget(totalCost, now);
  await bumpConversationCounters(input.conversationId, totalCost, totalTokensIn, totalTokensOut);

  return {
    text: finalText,
    pendingActionIds,
    costUsd: totalCost,
    mode: "llm",
  };
}

// ────────────────────── helpers ──────────────────────

async function callProvider(
  provider: LLMProvider,
  system: string,
  messages: ChatMessage[],
  tools: ReturnType<typeof filterToolsByPermissions>[number]["schema"][],
) {
  return provider.chat({
    system,
    messages,
    tools,
    strictTools: true,
    temperature: 0.2,
    maxTokens: 700,
  });
}

async function replayHistory(conversationId: number): Promise<ChatMessage[]> {
  const rows = await prisma.assistantMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: MAX_HISTORY_MESSAGES,
  });

  const out: ChatMessage[] = [];
  for (const r of rows) {
    if (r.role === "user") {
      out.push({ role: "user", content: wrapUserText(r.content) });
    } else if (r.role === "assistant") {
      if (isOperationalAssistantNotice(r.content)) {
        // Do not let transient infrastructure notices ("no provider",
        // "budget exhausted", etc.) become part of the LLM's persona.
        // WhatsApp staff sessions keep a long-running conversation, so a
        // temporary OpenAI-key outage can otherwise poison the next turn and
        // make the model keep repeating the old notice even after recovery.
        continue;
      }
      const rawCalls = (r.toolCalls as unknown as ToolCall[] | null) ?? null;
      // Strip the synthetic "_reflection_skipped" marker we add when the
      // reflection retry kicks in. It only exists in our audit trail so the
      // admin can see the suppressed apology — it must NEVER be replayed
      // to the LLM because OpenAI rejects assistant messages with
      // tool_calls that have no matching tool response.
      const calls = rawCalls
        ? rawCalls.filter((c) => c.id !== "_reflection_skipped" && c.name !== "_reflection")
        : null;
      if (rawCalls && rawCalls.length > 0 && (!calls || calls.length === 0)) {
        // The whole message was an internal reflection-skipped marker —
        // drop it from history entirely; the user never saw it.
        continue;
      }
      out.push({
        role: "assistant",
        content: r.content || null,
        ...(calls && calls.length > 0 ? { toolCalls: calls } : {}),
      });
    } else if (r.role === "tool") {
      if (!r.toolCallId || !r.toolName) continue;
      out.push({
        role: "tool",
        toolCallId: r.toolCallId,
        toolName: r.toolName,
        content: r.content,
      });
    }
  }
  return out;
}

function isOperationalAssistantNotice(content: string | null): boolean {
  if (!content) return false;
  return (
    content.includes("لم يتم ضبط مزوّد ذكاء اصطناعي") ||
    content.includes("نفدت الميزانية اليومية للمساعد") ||
    content.includes("المساعد الذكي معطّل")
  );
}

async function persistAssistantText(
  conversationId: number,
  text: string,
  pendingActionIds: number[],
  costUsd: number,
  mode: AssistantTurnResult["mode"],
): Promise<AssistantTurnResult> {
  await prisma.assistantMessage.create({
    data: { conversationId, role: "assistant", content: text },
  });
  await prisma.assistantConversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });
  return { text, pendingActionIds, costUsd, mode };
}

interface BudgetSnapshot {
  assistantDailyBudgetUsd: Prisma.Decimal;
  assistantCostTodayUsd: Prisma.Decimal;
  assistantCostResetAt: Date | null;
}

function isBudgetExhausted(cfg: BudgetSnapshot, now: Date): boolean {
  const budget = Number(cfg.assistantDailyBudgetUsd);
  if (!Number.isFinite(budget) || budget <= 0) return false;
  if (cfg.assistantCostResetAt && !isSameUtcDay(cfg.assistantCostResetAt, now)) {
    return false;
  }
  return Number(cfg.assistantCostTodayUsd) >= budget;
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

async function bumpAssistantBudget(deltaUsd: number, now: Date): Promise<void> {
  if (deltaUsd <= 0) return;
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: { assistantCostTodayUsd: true, assistantCostResetAt: true },
  });
  const newDay = !cfg?.assistantCostResetAt || !isSameUtcDay(cfg.assistantCostResetAt, now);
  await prisma.whatsAppConfig.update({
    where: { id: 1 },
    data: newDay
      ? { assistantCostTodayUsd: deltaUsd, assistantCostResetAt: now }
      : { assistantCostTodayUsd: { increment: deltaUsd } },
  });
}

async function bumpConversationCounters(
  conversationId: number,
  costUsd: number,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await prisma.assistantConversation.update({
    where: { id: conversationId },
    data: {
      llmTurns: { increment: 1 },
      llmTokensIn: { increment: tokensIn },
      llmTokensOut: { increment: tokensOut },
      costUsdTotal: { increment: costUsd },
      lastMessageAt: new Date(),
    },
  });
}
