import "server-only";
import OpenAI from "openai";
import type { ChatRequest, LLMProvider, LLMResponse, ToolCall } from "./types";
import type { ToolName } from "@/lib/whatsapp/bot/tools";
import { TOOL_NAMES } from "@/lib/whatsapp/bot/tools";

/**
 * OpenAI Chat Completions adapter.
 *
 * Why we still use Chat Completions (not the newer Responses API):
 *   • The tool-calling shape is identical and the SDK has battle-tested
 *     streaming + retry logic that we depend on under load.
 *   • Switching is a 30-line task once we want server-side conversation
 *     state (Responses can persist threads); we'll revisit when needed.
 */

interface ModelPricing {
  /** USD per 1M input tokens. */
  inUsdPerM: number;
  /** USD per 1M output tokens. */
  outUsdPerM: number;
}

/**
 * Pricing card — keep in sync with https://openai.com/api/pricing/.
 * Last updated: 2026-04 — gpt-4o-mini is still the recommended
 * cost/quality sweet spot for Arabic dialog with strict tool-calling.
 */
const PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini":     { inUsdPerM: 0.15, outUsdPerM: 0.60 },
  "gpt-4o":          { inUsdPerM: 2.50, outUsdPerM: 10.00 },
  "gpt-4.1-mini":    { inUsdPerM: 0.40, outUsdPerM: 1.60 },
  "gpt-4.1":         { inUsdPerM: 2.00, outUsdPerM: 8.00 },
};

function pricingFor(model: string): ModelPricing {
  return PRICING[model] ?? PRICING["gpt-4o-mini"];
}

function isKnownTool(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export class OpenAIAdapter implements LLMProvider {
  public readonly id = "openai" as const;
  public readonly model: string;
  private readonly client: OpenAI;

  constructor(opts: { apiKey: string; model: string; baseURL?: string }) {
    this.model = opts.model;
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
    });
  }

  async chat(req: ChatRequest): Promise<LLMResponse> {
    // ── Translate our provider-agnostic shape to OpenAI's schema. ───────
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    messages.push({ role: "system", content: req.system });
    for (const m of req.messages) {
      if (m.role === "system") {
        messages.push({ role: "system", content: m.content });
      } else if (m.role === "user") {
        messages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        messages.push({
          role: "assistant",
          content: m.content,
          ...(m.toolCalls?.length
            ? {
                tool_calls: m.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: c.argumentsJson },
                })),
              }
            : {}),
        });
      } else if (m.role === "tool") {
        messages.push({
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId,
        });
      }
    }

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = req.tools.map(
      (t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          strict: req.strictTools !== false,
        },
      }),
    );

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxTokens ?? 600,
    });

    const choice = completion.choices[0];
    const usage = completion.usage;
    const pricing = pricingFor(this.model);
    const promptTokens = usage?.prompt_tokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? 0;
    const costUsd =
      (promptTokens / 1_000_000) * pricing.inUsdPerM +
      (completionTokens / 1_000_000) * pricing.outUsdPerM;

    const rawCalls = choice?.message?.tool_calls ?? [];
    const toolCalls: ToolCall[] = [];
    for (const c of rawCalls) {
      if (c.type !== "function") continue;
      const name = c.function.name;
      if (!isKnownTool(name)) {
        // Drop hallucinated tool names — engine will see no tool calls and
        // can ask the model to retry or escalate.
        console.warn("[llm/openai] dropping unknown tool call", name);
        continue;
      }
      toolCalls.push({
        id: c.id,
        name,
        argumentsJson: c.function.arguments,
      });
    }

    return {
      text: choice?.message?.content ?? null,
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
        costUsd,
      },
      finishReason: choice?.finish_reason ?? "unknown",
    };
  }
}
