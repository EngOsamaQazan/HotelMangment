import "server-only";

/**
 * Provider-agnostic surface for any LLM-driven feature in the app
 * (the WhatsApp customer bot AND the staff assistant share this layer).
 * Implementations:
 *   • OpenAIAdapter   (Phase 3)   — gpt-4o-mini default.
 *   • GeminiAdapter   (later)     — gemini-2.0-flash for cost.
 *   • AnthropicAdapter (later)    — claude-haiku for highest dialog quality.
 *
 * Callers never import a concrete provider — they always ask
 * `getLLMProvider()` and get back the configured adapter. This keeps each
 * engine testable (swap a fake provider in unit tests) and lets us A/B
 * different models without touching the dialog logic.
 *
 * Tool names are typed as `string` here (not the WhatsApp bot's union)
 * because each engine ships its own set of tools. The adapter validates
 * tool calls against the schemas the caller passes in `ChatRequest.tools`.
 */

export type LLMProviderId = "openai" | "gemini" | "anthropic";

/**
 * Provider-neutral JSON Schema for a tool. Mirrors the OpenAI / Anthropic
 * shape so each adapter only needs a one-liner translation. Shared by the
 * WhatsApp bot tools and the staff assistant tools.
 */
export interface ToolJsonSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

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
  /** Tool name — engine-specific union, validated by the schemas in ChatRequest.tools. */
  toolName: string;
}

export type ChatMessage =
  | ChatSystemMessage
  | ChatUserMessage
  | ChatAssistantMessage
  | ChatToolMessage;

export interface ToolCall {
  id: string;
  /** Tool name — validated by the engine against the schemas it sent. */
  name: string;
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
