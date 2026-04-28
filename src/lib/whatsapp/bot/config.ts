import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/booking/encryption";

/**
 * Bot-side configuration accessor + updater. Lives next to the engine so
 * adding a new bot-only knob never requires touching the global WhatsApp
 * config UI in `src/lib/whatsapp/config.ts`.
 *
 * Secrets are stored as opaque encrypted strings in the database and
 * surfaced to the UI as `hasXxx: boolean` flags only — empty patch values
 * preserve the stored secret rather than nuking it.
 */

export interface BotPublicConfig {
  // Mode + rollout
  botMode: string;
  botRolloutPercentage: number;
  botCircuitBreakerEnabled: boolean;
  botActiveHoursStart: string | null;
  botActiveHoursEnd: string | null;

  // Persona
  botPersonaName: string;
  botPersonaTone: string;

  // LLM
  botLlmProvider: string;
  botLlmModel: string;
  hasBotLlmApiKey: boolean;
  botMaxToolHops: number;
  botMaxTurns: number;

  // Budget
  botDailyBudgetUsd: number;
  botCostTodayUsd: number;
  botCostResetAt: Date | null;

  // Pacing
  botHumanlikePacing: boolean;

  // Payments
  botPaymentCurrency: string;
  hasBotStripeSecret: boolean;
  hasBotStripeWebhookSecret: boolean;
  botPublicBaseUrl: string | null;
}

export async function loadBotConfig(): Promise<BotPublicConfig> {
  const row = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
  });
  if (!row) {
    // The legacy WhatsApp config helper guarantees row#1 exists; create one
    // here too to keep this module independently safe.
    await prisma.whatsAppConfig.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return loadBotConfig();
  }
  // Decimal columns come back as `Decimal` objects from Prisma, then become
  // plain strings once they cross the JSON wire to the browser. We coerce
  // here so every consumer (server and client) sees a plain `number` and
  // never has to defend against `null.toFixed(...)`.
  return {
    botMode: row.botMode,
    botRolloutPercentage: row.botRolloutPercentage ?? 0,
    botCircuitBreakerEnabled: row.botCircuitBreakerEnabled,
    botActiveHoursStart: row.botActiveHoursStart,
    botActiveHoursEnd: row.botActiveHoursEnd,
    botPersonaName: row.botPersonaName,
    botPersonaTone: row.botPersonaTone,
    botLlmProvider: row.botLlmProvider,
    botLlmModel: row.botLlmModel,
    hasBotLlmApiKey: !!row.botLlmApiKeyEnc,
    botMaxToolHops: row.botMaxToolHops ?? 5,
    botMaxTurns: row.botMaxTurns ?? 12,
    botDailyBudgetUsd: toNumber(row.botDailyBudgetUsd, 0),
    botCostTodayUsd: toNumber(row.botCostTodayUsd, 0),
    botCostResetAt: row.botCostResetAt,
    botHumanlikePacing: row.botHumanlikePacing,
    botPaymentCurrency: row.botPaymentCurrency,
    hasBotStripeSecret: !!row.botStripeSecretKeyEnc,
    hasBotStripeWebhookSecret: !!row.botStripeWebhookSecretEnc,
    botPublicBaseUrl: row.botPublicBaseUrl,
  };
}

function toNumber(v: unknown, fallback: number): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface UpdateBotConfigInput {
  botMode?: "off" | "shadow" | "allowlist" | "percentage" | "full";
  botRolloutPercentage?: number;
  botCircuitBreakerEnabled?: boolean;
  botActiveHoursStart?: string | null;
  botActiveHoursEnd?: string | null;
  botPersonaName?: string;
  botPersonaTone?: "warm" | "formal" | "playful";
  botLlmProvider?: "openai" | "gemini" | "anthropic";
  botLlmModel?: string;
  /** Plaintext key — if non-empty we encrypt + store; "" leaves it untouched. */
  botLlmApiKey?: string;
  botMaxToolHops?: number;
  botMaxTurns?: number;
  botDailyBudgetUsd?: number;
  botHumanlikePacing?: boolean;
  botPaymentCurrency?: string;
  botStripeSecretKey?: string;
  botStripeWebhookSecret?: string;
  botPublicBaseUrl?: string | null;
}

export async function updateBotConfig(patch: UpdateBotConfigInput): Promise<BotPublicConfig> {
  await prisma.whatsAppConfig.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  const data: Record<string, unknown> = {};

  if (patch.botMode !== undefined) data.botMode = patch.botMode;
  if (patch.botRolloutPercentage !== undefined)
    data.botRolloutPercentage = clampInt(patch.botRolloutPercentage, 0, 100);
  if (patch.botCircuitBreakerEnabled !== undefined)
    data.botCircuitBreakerEnabled = !!patch.botCircuitBreakerEnabled;

  if (patch.botActiveHoursStart !== undefined) {
    data.botActiveHoursStart = parseHHMM(patch.botActiveHoursStart);
  }
  if (patch.botActiveHoursEnd !== undefined) {
    data.botActiveHoursEnd = parseHHMM(patch.botActiveHoursEnd);
  }

  if (patch.botPersonaName !== undefined)
    data.botPersonaName =
      (patch.botPersonaName || "").trim().slice(0, 60) || "محمد";
  if (patch.botPersonaTone !== undefined) data.botPersonaTone = patch.botPersonaTone;
  if (patch.botLlmProvider !== undefined) data.botLlmProvider = patch.botLlmProvider;
  if (patch.botLlmModel !== undefined)
    data.botLlmModel = (patch.botLlmModel || "").trim() || "gpt-4o-mini";
  if (patch.botMaxToolHops !== undefined)
    data.botMaxToolHops = clampInt(patch.botMaxToolHops, 1, 12);
  if (patch.botMaxTurns !== undefined)
    data.botMaxTurns = clampInt(patch.botMaxTurns, 4, 32);
  if (patch.botDailyBudgetUsd !== undefined) {
    const n = Number(patch.botDailyBudgetUsd);
    if (Number.isFinite(n) && n >= 0) data.botDailyBudgetUsd = n;
  }
  if (patch.botHumanlikePacing !== undefined)
    data.botHumanlikePacing = !!patch.botHumanlikePacing;
  if (patch.botPaymentCurrency !== undefined)
    data.botPaymentCurrency =
      (patch.botPaymentCurrency || "").toUpperCase().slice(0, 3) || "JOD";
  if (patch.botPublicBaseUrl !== undefined)
    data.botPublicBaseUrl =
      typeof patch.botPublicBaseUrl === "string" && patch.botPublicBaseUrl.trim()
        ? patch.botPublicBaseUrl.trim().replace(/\/+$/, "")
        : null;

  // Secrets — empty strings preserve the stored value.
  if (typeof patch.botLlmApiKey === "string" && patch.botLlmApiKey.trim()) {
    data.botLlmApiKeyEnc = encryptSecret(patch.botLlmApiKey.trim());
  }
  if (typeof patch.botStripeSecretKey === "string" && patch.botStripeSecretKey.trim()) {
    data.botStripeSecretKeyEnc = encryptSecret(patch.botStripeSecretKey.trim());
  }
  if (
    typeof patch.botStripeWebhookSecret === "string" &&
    patch.botStripeWebhookSecret.trim()
  ) {
    data.botStripeWebhookSecretEnc = encryptSecret(
      patch.botStripeWebhookSecret.trim(),
    );
  }

  if (Object.keys(data).length > 0) {
    await prisma.whatsAppConfig.update({ where: { id: 1 }, data });
  }
  return loadBotConfig();
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseHHMM(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}
