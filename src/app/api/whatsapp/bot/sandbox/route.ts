import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { getLLMProvider } from "@/lib/llm";
import {
  ALL_TOOL_SCHEMAS,
  runTool,
  type ToolContext,
  type ToolName,
} from "@/lib/whatsapp/bot/tools";
import {
  ensureBotConversation,
  ensureGuestAccountForPhone,
  normalizePhone,
} from "@/lib/whatsapp/bot/identity";
import { buildSystemPrompt, sanitizeUserText, wrapUserText } from "@/lib/whatsapp/bot/prompt";
import type { ChatMessage, ToolCall } from "@/lib/llm";

/**
 * Sandbox endpoint for the bot configuration page. Lets an operator type a
 * hypothetical guest message and see exactly what the bot would reply,
 * including every tool call + result, WITHOUT touching WhatsApp.
 *
 * Critical safety properties:
 *   • Uses a `+sandbox-` phone prefix so we never collide with a real
 *     contact's BotConversation row.
 *   • Bypasses `sendBotText` entirely — replies are returned in the JSON
 *     payload, never delivered to anyone.
 *   • Tool calls run for real (createHold writes a real Reservation row,
 *     createPaymentLink hits Stripe). Operators are warned in the UI to
 *     use the Stripe TEST key for their LLM API key in sandbox testing.
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    try {
      await requirePermission("whatsapp.bot:use_sandbox");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json().catch(() => ({}))) as {
      sandboxPhone?: string;
      message?: string;
      reset?: boolean;
    };

    if (body.reset) {
      await resetSandbox(body.sandboxPhone);
      return NextResponse.json({ ok: true, reset: true });
    }

    const text = (body.message ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "رسالة فارغة" }, { status: 400 });
    }

    // ── Sandbox identity ───────────────────────────────────────────────
    const sandboxPhone = sandboxPhoneFor(body.sandboxPhone);
    const { guestAccount } = await ensureGuestAccountForPhone({
      phone: sandboxPhone,
      profileName: "ضيف اختبار (Sandbox)",
    });
    const botConv = await ensureBotConversation({
      phone: sandboxPhone,
      guestAccountId: guestAccount.id,
    });
    await prisma.botConversationEvent.create({
      data: {
        botConvId: botConv.id,
        kind: "user_msg",
        payload: { type: "text", body: text, sandbox: true } as object,
      },
    });

    const provider = await getLLMProvider();
    if (!provider) {
      return NextResponse.json({
        error: "مزود LLM غير مهيأ — أضِف مفتاح OpenAI أو فعّل وضع البوت العادي.",
      }, { status: 412 });
    }

    const cfg = await prisma.whatsAppConfig.findUniqueOrThrow({ where: { id: 1 } });
    const ctx: ToolContext = {
      botConv,
      guestAccount,
      contactPhone: sandboxPhone,
      contactName: "ضيف اختبار",
      now: new Date(),
    };

    const system = buildSystemPrompt({
      cfg: {
        botPersonaName: cfg.botPersonaName,
        botPersonaTone: cfg.botPersonaTone,
        botPaymentCurrency: cfg.botPaymentCurrency,
        displayPhoneNumber: cfg.displayPhoneNumber,
      },
      botConv,
      guestName: guestAccount.fullName,
    });

    // Reload events for context.
    const events = await prisma.botConversationEvent.findMany({
      where: { botConvId: botConv.id, kind: { in: ["user_msg", "bot_msg", "tool_result"] } },
      orderBy: { createdAt: "asc" },
      take: 60,
    });

    const messages: ChatMessage[] = [];
    for (const ev of events) {
      const p = ev.payload as Record<string, unknown> | null;
      if (!p) continue;
      if (ev.kind === "user_msg") {
        messages.push({
          role: "user",
          content: wrapUserText(sanitizeUserText(String(p.body ?? ""))),
        });
      } else if (ev.kind === "bot_msg") {
        messages.push({
          role: "assistant",
          content: typeof p.text === "string" ? p.text : null,
          ...(Array.isArray(p.toolCalls) ? { toolCalls: p.toolCalls as ToolCall[] } : {}),
        });
      } else if (ev.kind === "tool_result") {
        messages.push({
          role: "tool",
          toolCallId: String(p.toolCallId ?? ""),
          toolName: String(p.toolName ?? "") as ToolName,
          content: JSON.stringify(p.result ?? null),
        });
      }
    }

    // Run the same engine loop, capturing the trace for the UI.
    const trace: Array<
      | { kind: "assistant"; text: string | null; toolCalls?: ToolCall[]; usage?: unknown }
      | { kind: "tool_result"; toolName: string; result: unknown }
    > = [];

    const maxHops = cfg.botMaxToolHops || 5;
    let totalCost = 0;
    let finalText: string | null = null;

    for (let hop = 0; hop < maxHops; hop++) {
      const resp = await provider.chat({
        system,
        messages,
        tools: ALL_TOOL_SCHEMAS,
        strictTools: true,
        temperature: 0.3,
      });
      totalCost += resp.usage.costUsd;
      trace.push({
        kind: "assistant",
        text: resp.text,
        toolCalls: resp.toolCalls,
        usage: resp.usage,
      });

      if (resp.toolCalls.length === 0) {
        finalText = (resp.text ?? "").trim() || null;
        if (finalText) {
          await prisma.botConversationEvent.create({
            data: {
              botConvId: botConv.id,
              kind: "bot_msg",
              payload: { text: finalText, sandbox: true } as object,
            },
          });
        }
        break;
      }

      messages.push({ role: "assistant", content: resp.text, toolCalls: resp.toolCalls });
      for (const call of resp.toolCalls) {
        let parsed: unknown = {};
        try {
          parsed = JSON.parse(call.argumentsJson || "{}");
        } catch {
          parsed = {};
        }
        const result = await runTool(call.name, parsed, ctx);
        trace.push({ kind: "tool_result", toolName: call.name, result });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          toolName: call.name,
          content: JSON.stringify(result),
        });
        await prisma.botConversationEvent.create({
          data: {
            botConvId: botConv.id,
            kind: "tool_result",
            payload: {
              toolCallId: call.id,
              toolName: call.name,
              args: parsed as object,
              result: result as object,
              sandbox: true,
            } as object,
          },
        });
      }
    }

    return NextResponse.json({
      sandboxPhone,
      finalText,
      trace,
      costUsd: Number(totalCost.toFixed(6)),
      botConvState: (await prisma.botConversation.findUnique({ where: { id: botConv.id } }))?.state,
    });
  } catch (err) {
    console.error("[POST /api/whatsapp/bot/sandbox]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "خطأ غير متوقع" },
      { status: 500 },
    );
  }
}

/** Reset the sandbox conversation state — purges history + slots. */
async function resetSandbox(rawPhone: string | undefined): Promise<void> {
  const phone = sandboxPhoneFor(rawPhone);
  await prisma.botConversation
    .deleteMany({ where: { contactPhone: phone } })
    .catch(() => undefined);
  await prisma.guestAccount
    .deleteMany({ where: { phone } })
    .catch(() => undefined);
}

/**
 * Build a deterministic E.164-ish phone for the sandbox row. We use the
 * literal "999000" prefix (a non-routable test range) followed by a 9-char
 * hash of the operator-supplied tag so each operator/test session gets
 * its own bot conversation.
 */
function sandboxPhoneFor(tag: string | undefined): string {
  const cleaned = normalizePhone(tag ?? "default");
  // Always force the test prefix so we never collide with a real number.
  return `999000${cleaned.slice(-9).padStart(9, "0")}`;
}
