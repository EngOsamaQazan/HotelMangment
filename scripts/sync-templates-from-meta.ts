/**
 * Pull the latest template list straight from Meta and upsert into our DB
 * — bypasses the HTTP route for standalone diagnostics. Run with:
 *   npx ts-node --project tsconfig.scripts.json scripts/sync-templates-from-meta.ts
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig(); // fallback to .env
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Match the base64(iv | tag | ciphertext) format from src/lib/booking/encryption.ts.
const ENC_ALG = "aes-256-gcm";
const IV_LEN = 12;
function getKey(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error("BOOKING_ENC_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(raw, "hex");
}
function decryptSecret(packed: string): string {
  if (!packed) return "";
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv(ENC_ALG, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.accessTokenEnc || !cfg.wabaId || !cfg.appSecretEnc) {
    throw new Error("Config incomplete — can't sync templates.");
  }
  const accessToken = decryptSecret(cfg.accessTokenEnc);
  const appSecret = decryptSecret(cfg.appSecretEnc);
  const proof = crypto.createHmac("sha256", appSecret).update(accessToken).digest("hex");

  const url =
    `https://graph.facebook.com/${cfg.apiVersion}/${cfg.wabaId}/message_templates` +
    `?limit=100&access_token=${encodeURIComponent(accessToken)}` +
    `&appsecret_proof=${proof}`;

  const res = await fetch(url);
  const json = (await res.json()) as {
    data?: Array<{
      id?: string;
      name: string;
      language: string;
      category: string;
      status: string;
      rejected_reason?: string;
      components?: unknown;
    }>;
    error?: { message: string; code?: number };
  };

  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }

  const rows = json.data ?? [];
  console.log(`Fetched ${rows.length} templates from Meta:\n`);
  for (const r of rows) {
    console.log(
      `- ${r.name.padEnd(32)} ${r.language.padEnd(6)} ${r.category.padEnd(12)} ${r.status}${
        r.rejected_reason && r.rejected_reason !== "NONE"
          ? ` — ${r.rejected_reason}`
          : ""
      }`,
    );

    await prisma.whatsAppTemplate.upsert({
      where: { name_language: { name: r.name, language: r.language } },
      create: {
        name: r.name,
        language: r.language,
        category: r.category,
        status: r.status,
        components: r.components as never,
        metaId: r.id ?? null,
        rejectionReason: r.rejected_reason ?? null,
        lastSyncedAt: new Date(),
      },
      update: {
        category: r.category,
        status: r.status,
        components: r.components as never,
        metaId: r.id ?? null,
        rejectionReason: r.rejected_reason ?? null,
        lastSyncedAt: new Date(),
      },
    });
  }
  console.log(`\nUpserted ${rows.length} rows into whatsapp_templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
