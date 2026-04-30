/**
 * One-off helper: take an OpenAI API key passed as the first CLI argument,
 * encrypt it with the project's `encryptSecret` helper, and store it on
 * `WhatsAppConfig.botLlmApiKeyEnc` (the same column the staff assistant
 * and the WhatsApp bot both read via `getLLMProvider()`).
 *
 * ── Local (dev) ────────────────────────────────────────────────────────
 *   npx ts-node --project tsconfig.scripts.json scripts/set-llm-api-key.ts sk-proj-...
 *
 * ── Production ─────────────────────────────────────────────────────────
 * You MUST run the same script against the production database so the
 * staff assistant works there too. Two requirements:
 *
 *   1. Point DATABASE_URL at production (or pass it inline):
 *        $env:DATABASE_URL = "postgres://...prod..."
 *        $env:BOOKING_ENC_KEY = "<same 64-hex master key as production>"
 *        npx ts-node --project tsconfig.scripts.json scripts/set-llm-api-key.ts sk-proj-...
 *
 *   2. CRITICAL: BOOKING_ENC_KEY MUST be the production master key, NOT
 *      the dev fallback. If you encrypt with a different key than what the
 *      production server uses, `decryptSecret()` will return "" and the
 *      LLM provider will silently fall back to "no provider" → the bot
 *      replies generically. There's no decryption error in the logs because
 *      the helper swallows the bad-tag error on purpose (booking/encryption.ts).
 *
 *   3. After the script finishes, restart the production Next.js process so
 *      the in-memory `cached` provider in src/lib/llm/index.ts is rebuilt.
 *
 * Notes:
 *   • This script also flips `assistantEnabled = true` so the new key
 *     immediately powers the staff assistant.
 *   • It also sets `botLlmProvider = "openai"` and `botLlmModel = "gpt-4o-mini"`
 *     since these are the cheapest combo we currently support.
 */

import { config as loadEnv } from "dotenv";
import path from "node:path";

// Load env files in the same order Next.js does (.env.local takes precedence
// over .env). Without this the script would fall back to a key derived from
// an empty NEXTAUTH_SECRET in `.env`, encrypt the API key with the wrong
// master key, and the running Next.js server would fail to decrypt with
// `Unsupported state or unable to authenticate data` (AES-GCM auth-tag
// mismatch). MUST run before importing anything that reads getKey().
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { encryptSecret } from "../src/lib/booking/encryption";

async function main() {
  const key = (process.argv[2] ?? "").trim();
  if (!key) {
    console.error("Usage: ts-node scripts/set-llm-api-key.ts <openai-key>");
    process.exit(1);
  }
  if (!key.startsWith("sk-")) {
    console.error("Suspicious key — must start with 'sk-'.");
    process.exit(1);
  }

  const enc = encryptSecret(key);
  const prisma = new PrismaClient();
  try {
    await prisma.whatsAppConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        botLlmApiKeyEnc: enc,
        botLlmProvider: "openai",
        botLlmModel: "gpt-4o-mini",
        assistantEnabled: true,
      },
      update: {
        botLlmApiKeyEnc: enc,
        botLlmProvider: "openai",
        botLlmModel: "gpt-4o-mini",
        assistantEnabled: true,
      },
    });
    console.log("✅ تم حفظ مفتاح OpenAI مشفّراً وتفعيل المساعد الذكي.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Failed to store key:", err);
  process.exit(1);
});
