import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/booking/encryption";
import type { LLMProvider } from "./types";

export type {
  LLMProvider,
  LLMProviderId,
  LLMResponse,
  LLMUsage,
  ChatMessage,
  ChatRequest,
  ChatRole,
  ToolCall,
} from "./types";

/**
 * Resolve the configured LLM provider from `WhatsAppConfig`. Returns null
 * when the bot is unconfigured or running in fallback-only mode.
 *
 * The cache key includes a fingerprint of the secret so an admin rotating
 * the API key in `/settings/whatsapp/bot` takes effect on the next call
 * without a server restart.
 */
let cached:
  | { fingerprint: string; provider: LLMProvider }
  | null = null;

function fingerprint(parts: { secret: string; provider: string; model: string }): string {
  const tail = parts.secret.slice(-6);
  return `${parts.provider}:${parts.model}:${tail}`;
}

export async function getLLMProvider(): Promise<LLMProvider | null> {
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: {
      botLlmProvider: true,
      botLlmModel: true,
      botLlmApiKeyEnc: true,
    },
  });
  const enc = cfg?.botLlmApiKeyEnc;
  if (!enc) return null;
  const apiKey = decryptSecret(enc);
  if (!apiKey) return null;

  const provider = cfg?.botLlmProvider ?? "openai";
  const model = cfg?.botLlmModel ?? "gpt-4o-mini";
  const fp = fingerprint({ secret: apiKey, provider, model });

  if (cached && cached.fingerprint === fp) return cached.provider;

  if (provider === "openai") {
    const { OpenAIAdapter } = await import("./openai");
    const impl = new OpenAIAdapter({ apiKey, model });
    cached = { fingerprint: fp, provider: impl };
    return impl;
  }

  // Future: gemini, anthropic adapters. Until they exist we return null
  // and the engine falls back to the rule-based dialog.
  console.warn(`[llm] provider "${provider}" not implemented yet`);
  return null;
}

/** Test-only — drop the singleton between tests. */
export function _resetLLMCache(): void {
  cached = null;
}
