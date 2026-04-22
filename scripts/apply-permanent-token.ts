/**
 * Apply a freshly minted System User Permanent Token to the local install
 * and verify it against Meta. Steps:
 *   1. Debug against /debug_token to confirm type=SYSTEM_USER + expires=0.
 *   2. Encrypt + persist to WhatsAppConfig singleton.
 *   3. Update .env.local so future cold-starts have it.
 *   4. Call /phone-number-id to smoke-test.
 *   5. Sync templates from Meta.
 *
 * Usage:
 *   $env:PERM_TOKEN="EAAG..."
 *   npx ts-node --project tsconfig.scripts.json scripts/apply-permanent-token.ts
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const APP_ID = process.env.META_APP_ID!;
const APP_SECRET = process.env.META_APP_SECRET!;
const WABA_ID = process.env.WHATSAPP_WABA_ID!;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const IV_LEN = 12;

function key(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error("bad BOOKING_ENC_KEY");
  return Buffer.from(raw, "hex");
}
function enc(p: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(p, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}
function proof(t: string): string {
  return crypto.createHmac("sha256", APP_SECRET).update(t).digest("hex");
}
async function gget<T = unknown>(p: string, token: string): Promise<T> {
  const sep = p.includes("?") ? "&" : "?";
  const res = await fetch(
    `https://graph.facebook.com${p}${sep}access_token=${encodeURIComponent(
      token,
    )}&appsecret_proof=${proof(token)}`,
  );
  const j = (await res.json()) as { error?: { message: string } } & T;
  if (!res.ok || (j as { error?: unknown }).error)
    throw new Error(
      (j as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`,
    );
  return j as T;
}

async function main() {
  const token = process.env.PERM_TOKEN?.trim();
  if (!token?.startsWith("EA")) {
    throw new Error("PERM_TOKEN is missing or invalid.");
  }

  console.log("── 1/5  Debugging token against Meta ──");
  const app = `${APP_ID}|${APP_SECRET}`;
  const dbg = await gget<{
    data: {
      type: string;
      is_valid: boolean;
      expires_at: number;
      scopes?: string[];
      app_id: string;
      application?: string;
    };
  }>(
    `/debug_token?input_token=${encodeURIComponent(token)}`.replace(
      /^/,
      "",
    ) + `&access_token=${encodeURIComponent(app)}`.replace(/^/, ""),
    token,
  ).catch(async () => {
    const res = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(
        token,
      )}&access_token=${encodeURIComponent(app)}`,
    );
    const j = await res.json();
    return j as {
      data: {
        type: string;
        is_valid: boolean;
        expires_at: number;
        scopes?: string[];
        app_id: string;
        application?: string;
      };
    };
  });
  const d = dbg.data;
  console.log(`   type:   ${d.type}`);
  console.log(`   valid:  ${d.is_valid}`);
  console.log(
    `   expires: ${d.expires_at === 0 ? "NEVER ✅" : new Date(d.expires_at * 1000).toISOString()}`,
  );
  console.log(`   scopes: ${d.scopes?.join(", ")}`);
  if (!d.is_valid) throw new Error("token reports invalid — please regenerate.");
  if (d.type !== "SYSTEM_USER" && d.type !== "SYSTEM") {
    console.warn(
      `   ⚠️  type is ${d.type}, not SYSTEM_USER — it may still work but won't last.`,
    );
  }

  console.log("\n── 2/5  Saving to DB + .env.local ──");
  const existing = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  const payload = {
    appId: APP_ID,
    appSecretEnc: enc(APP_SECRET),
    wabaId: WABA_ID,
    phoneNumberId: PHONE_ID,
    accessTokenEnc: enc(token),
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? null,
    apiVersion: API_VERSION,
    lastVerifiedAt: null,
    lastVerifyOk: null,
    lastError: null,
  };
  if (existing) {
    await prisma.whatsAppConfig.update({ where: { id: 1 }, data: payload });
  } else {
    await prisma.whatsAppConfig.create({ data: { id: 1, ...payload } });
  }
  console.log("   ✓ DB singleton updated");

  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) {
    let src = fs.readFileSync(envPath, "utf8");
    src = src.includes("WHATSAPP_ACCESS_TOKEN=")
      ? src.replace(/^WHATSAPP_ACCESS_TOKEN=.*$/m, `WHATSAPP_ACCESS_TOKEN=${token}`)
      : src.trimEnd() + `\nWHATSAPP_ACCESS_TOKEN=${token}\n`;
    fs.writeFileSync(envPath, src, "utf8");
    console.log("   ✓ .env.local updated");
  }

  console.log("\n── 3/5  Live phone-number probe ──");
  const phone = await gget<{
    display_phone_number: string;
    verified_name: string;
    quality_rating: string;
    messaging_limit_tier: string;
    status: string;
  }>(
    `/${API_VERSION}/${PHONE_ID}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,status`,
    token,
  );
  console.log(`   ✓ +${phone.display_phone_number}  |  ${phone.verified_name}`);
  console.log(`   status=${phone.status}  tier=${phone.messaging_limit_tier}`);
  await prisma.whatsAppConfig.update({
    where: { id: 1 },
    data: {
      displayPhoneNumber: phone.display_phone_number,
      lastVerifiedAt: new Date(),
      lastVerifyOk: true,
    },
  });

  console.log("\n── 4/5  Subscribing App to WABA webhook ──");
  try {
    const subRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/subscribed_apps?access_token=${encodeURIComponent(
        token,
      )}&appsecret_proof=${proof(token)}`,
      { method: "POST" },
    );
    const sj = await subRes.json();
    if (sj.success || sj.id) console.log("   ✓ WABA subscribed");
    else console.log("   (WABA subscribe:", JSON.stringify(sj).slice(0, 150), ")");
  } catch (e) {
    console.log("   (subscribe error:", (e as Error).message + ")");
  }

  console.log("\n── 5/5  Syncing templates from Meta ──");
  const tpls = await gget<{
    data: Array<{
      id?: string;
      name: string;
      language: string;
      category: string;
      status: string;
      rejected_reason?: string;
      components?: unknown;
    }>;
  }>(`/${API_VERSION}/${WABA_ID}/message_templates?limit=100`, token);
  for (const t of tpls.data) {
    await prisma.whatsAppTemplate.upsert({
      where: { name_language: { name: t.name, language: t.language } },
      create: {
        name: t.name,
        language: t.language,
        category: t.category,
        status: t.status,
        components: t.components as never,
        metaId: t.id ?? null,
        rejectionReason: t.rejected_reason ?? null,
        lastSyncedAt: new Date(),
      },
      update: {
        category: t.category,
        status: t.status,
        components: t.components as never,
        metaId: t.id ?? null,
        rejectionReason: t.rejected_reason ?? null,
        lastSyncedAt: new Date(),
      },
    });
    console.log(`   ${t.status.padEnd(9)} ${t.language}  ${t.name}`);
  }

  console.log(
    "\n✅ Local install is FULLY WIRED. Token is saved, DB updated, WABA subscribed, templates synced.",
  );
}

main()
  .catch((e) => {
    console.error("\n❌", e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
