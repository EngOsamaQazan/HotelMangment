import "server-only";
import type { ToolJsonSchema, ToolName } from "@/lib/whatsapp/bot/tools";

/**
 * Provider-agnostic surface for the bot's LLM. Implementations:
 *   • OpenAIAdapter   (Phase 3)   — gpt-4o-mini default.
 *   • GeminiAdapter   (later)     — gemini-2.0-flash for cost.
 *   • AnthropicAdapter (later)    — claude-haiku for highest dialog quality.
 *
 * The bot engine never imports a concrete provider — it always asks
 * `getLLMProvider()` and gets back the configured adapter. This keeps the
 * engine testable (swap a fake provider in unit tests) and lets us A/B
 * different models without touching the dialog logic.
 */

export type LLMProviderId = "openai" | "gemini" | "anthropic";

/** Roles mirror OpenAI's chat completions for direct mapping convenience. */
export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessageBase {
  role: ChatRole;
}

export interface ChatSystemMessage extends ChatMessageBase {
  role: "system";
  content: string;
}

export interface ChatUserMessage extends ChatMessageBase {
  role: "user";
  content: string;
}

export interface ChatAssistantMessage extends ChatMessageBase {
  role: "assistant";
  /** Final natural-language reply — null when the assistant only emitted tool_calls. */
  content: string | null;
  toolCalls?: ToolCall[];
}

export interface ChatToolMessage extends ChatMessageBase {
  role: "tool";
  /** Stringified JSON returned by the tool runtime. */
  content: string;
  toolCallId: string;
  toolName: ToolName;
}

export type ChatMessage =
  | ChatSystemMessage
  | ChatUserMessage
  | ChatAssistantMessage
  | ChatToolMessage;

export interface ToolCall {
  id: string;
  name: ToolName;
  /** Raw JSON string emitted by the model — caller is responsible for parsing. */
  argumentsJson: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  /** Provider-reported total. Equal to promptTokens + completionTokens for OpenAI. */
  totalTokens: number;
  /** USD cost we computed locally from the provider's pricing card. */
  costUsd: number;
}

export interface LLMResponse {
  /** Stripped of any tool_call leakage in `content` — clean Arabic/English text only. */
  text: string | null;
  toolCalls: ToolCall[];
  usage: LLMUsage;
  /** "stop" | "tool_calls" | "length" | "content_filter" | other provider stop reasons. */
  finishReason: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolJsonSchema[];
  /** Default 0.3 — keep low so the bot is consistent. */
  temperature?: number;
  /** Hard cap on output tokens. Phase 3 default: 600. */
  maxTokens?: number;
  /**
   * When true (default), asks the provider to enforce strict JSON-schema
   * validation on tool arguments. Reduces hallucinated arguments.
   */
  strictTools?: boolean;
}

export interface LLMProvider {
  id: LLMProviderId;
  /** Concrete model slug (e.g. "gpt-4o-mini"). */
  model: string;
  chat(req: ChatRequest): Promise<LLMResponse>;
}
