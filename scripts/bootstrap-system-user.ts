/**
 * One-shot bootstrapper for the MafHotel WhatsApp integration.
 *
 * Takes a fresh short-lived USER token (from Graph API Explorer) and
 *   1. Exchanges it for a long-lived user token
 *   2. Finds or creates a System User on the Business ("فندق المفرق")
 *   3. Assigns the App + WABA to that System User (FULL_CONTROL)
 *   4. Generates a **permanent** System User access token
 *   5. Saves the permanent token everywhere:
 *        - .env.local (WHATSAPP_ACCESS_TOKEN)
 *        - WhatsAppConfig singleton (encrypted)
 *
 * Why short-lived user token? Because creating a System User / generating
 * its permanent token requires a user session context — the System User
 * itself can't bootstrap itself from nothing.
 *
 * Usage:
 *   $env:FRESH_USER_TOKEN="EAAG..."  (PowerShell)
 *   npx ts-node --project tsconfig.scripts.json scripts/bootstrap-system-user.ts
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APP_ID = process.env.META_APP_ID!;
const APP_SECRET = process.env.META_APP_SECRET!;
const WABA_ID = process.env.WHATSAPP_WABA_ID!;
const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const SYSTEM_USER_NAME = process.env.SYSTEM_USER_NAME || "HotelAppBot";

const IV_LEN = 12;
function getKey(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error("BOOKING_ENC_KEY must be 64 hex chars (32 bytes).");
  }
  return Buffer.from(raw, "hex");
}
function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

function proof(token: string): string {
  return crypto.createHmac("sha256", APP_SECRET).update(token).digest("hex");
}

async function gapi<T = unknown>(
  pathAndQuery: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `https://graph.facebook.com${pathAndQuery}${sep}access_token=${encodeURIComponent(
    token,
  )}&appsecret_proof=${proof(token)}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Meta returned non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  const body = j as { error?: { message: string; code?: number } };
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? `HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return j as T;
}

async function step1_extendToken(shortLived: string): Promise<string> {
  console.log("\n── Step 1/5: Extending short-lived token to long-lived ──");
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token` +
      `?grant_type=fb_exchange_token` +
      `&client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}` +
      `&fb_exchange_token=${encodeURIComponent(shortLived)}`,
  );
  const j = (await res.json()) as { access_token?: string; error?: { message: string } };
  if (!res.ok || !j.access_token) {
    throw new Error(`Extend failed: ${j.error?.message ?? `HTTP ${res.status}`}`);
  }
  console.log("   ✓ long-lived token obtained");
  return j.access_token;
}

async function step2_findBusinessId(token: string): Promise<string> {
  console.log("\n── Step 2/5: Finding the owning Business ──");
  // First try: WABA's owning business.
  try {
    const waba = await gapi<{ owner_business_info?: { id?: string; name?: string } }>(
      `/${API_VERSION}/${WABA_ID}?fields=owner_business_info`,
      token,
    );
    const bizId = waba.owner_business_info?.id;
    if (bizId) {
      console.log(`   ✓ Business: ${waba.owner_business_info?.name} (${bizId})`);
      return bizId;
    }
  } catch (e) {
    console.log("   (WABA lookup failed — falling back to /me/businesses)", (e as Error).message);
  }
  // Fallback: list businesses the user owns.
  const me = await gapi<{ data?: Array<{ id: string; name: string }> }>(
    `/${API_VERSION}/me/businesses`,
    token,
  );
  const biz = me.data?.[0];
  if (!biz) throw new Error("User is not attached to any Business — cannot continue.");
  console.log(`   ✓ Business: ${biz.name} (${biz.id})`);
  return biz.id;
}

interface SystemUser {
  id: string;
  name: string;
}

async function step3_findOrCreateSystemUser(
  businessId: string,
  token: string,
): Promise<SystemUser> {
  console.log("\n── Step 3/5: Finding or creating System User ──");

  const list = await gapi<{ data?: SystemUser[] }>(
    `/${API_VERSION}/${businessId}/system_users?fields=id,name`,
    token,
  );
  const existing = list.data?.find((s) => s.name === SYSTEM_USER_NAME);
  if (existing) {
    console.log(`   ✓ Found existing: ${existing.name} (${existing.id})`);
    return existing;
  }

  console.log(`   Creating new system user "${SYSTEM_USER_NAME}"…`);
  const created = await gapi<{ id: string }>(
    `/${API_VERSION}/${businessId}/system_users?name=${encodeURIComponent(
      SYSTEM_USER_NAME,
    )}&role=ADMIN`,
    token,
    { method: "POST" },
  );
  console.log(`   ✓ Created: ${SYSTEM_USER_NAME} (${created.id})`);
  return { id: created.id, name: SYSTEM_USER_NAME };
}

async function step4_assignAssets(
  systemUserId: string,
  businessId: string,
  token: string,
): Promise<void> {
  console.log("\n── Step 4/5: Assigning App + WABA to System User ──");

  // Assign the App.
  try {
    await gapi(
      `/${API_VERSION}/${APP_ID}/agencies`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          child_business_id: businessId,
          permitted_tasks: JSON.stringify(["DEVELOP", "MANAGE"]),
        }).toString(),
      },
    );
  } catch (e) {
    // Usually "already linked" — log and continue.
    console.log("   (app/agencies:", (e as Error).message + ")");
  }

  // Assign the WABA with full control.
  try {
    await gapi(
      `/${API_VERSION}/${WABA_ID}/assigned_users` +
        `?user=${systemUserId}` +
        `&tasks=${encodeURIComponent(JSON.stringify(["MANAGE", "DEVELOP", "MESSAGING"]))}`,
      token,
      { method: "POST" },
    );
    console.log("   ✓ WABA assigned to system user");
  } catch (e) {
    const msg = (e as Error).message;
    if (/already assigned/i.test(msg) || /duplicate/i.test(msg)) {
      console.log("   ✓ WABA already assigned (OK)");
    } else {
      console.log("   (WABA assign warning:", msg + ")");
    }
  }

  // Also assign the App to the system user (needed for token generation).
  try {
    await gapi(
      `/${API_VERSION}/${APP_ID}/roles` +
        `?user=${systemUserId}` +
        `&role=ADMIN`,
      token,
      { method: "POST" },
    );
    console.log("   ✓ App role granted to system user");
  } catch (e) {
    const msg = (e as Error).message;
    if (/already/i.test(msg)) {
      console.log("   ✓ App role already set (OK)");
    } else {
      console.log("   (App role warning:", msg + ")");
    }
  }
}

async function step5_generatePermanentToken(
  systemUserId: string,
  token: string,
): Promise<string> {
  console.log("\n── Step 5/5: Generating permanent System User token ──");
  const scopes = ["whatsapp_business_management", "whatsapp_business_messaging"];
  const res = await gapi<{ access_token: string }>(
    `/${API_VERSION}/${systemUserId}/access_tokens` +
      `?business_app=${APP_ID}` +
      `&scope=${encodeURIComponent(scopes.join(","))}` +
      `&set_token_expires_in_days=NEVER`,
    token,
    { method: "POST" },
  );
  console.log("   ✓ Permanent token generated");
  return res.access_token;
}

async function savePermanentToken(permToken: string): Promise<void> {
  console.log("\n── Saving permanent token ──");

  // 1. Update the encrypted DB singleton.
  const existing = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (existing) {
    await prisma.whatsAppConfig.update({
      where: { id: 1 },
      data: {
        accessTokenEnc: encrypt(permToken),
        lastVerifiedAt: null,
        lastVerifyOk: null,
        lastError: null,
      },
    });
  } else {
    await prisma.whatsAppConfig.create({
      data: {
        id: 1,
        appId: APP_ID,
        appSecretEnc: encrypt(APP_SECRET),
        wabaId: WABA_ID,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
        accessTokenEnc: encrypt(permToken),
        webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? null,
        apiVersion: API_VERSION,
      },
    });
  }
  console.log("   ✓ DB singleton updated");

  // 2. Update .env.local.
  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) {
    let src = fs.readFileSync(envPath, "utf8");
    if (src.includes("WHATSAPP_ACCESS_TOKEN=")) {
      src = src.replace(
        /^WHATSAPP_ACCESS_TOKEN=.*$/m,
        `WHATSAPP_ACCESS_TOKEN=${permToken}`,
      );
    } else {
      src = src.trimEnd() + `\nWHATSAPP_ACCESS_TOKEN=${permToken}\n`;
    }
    fs.writeFileSync(envPath, src, "utf8");
    console.log("   ✓ .env.local updated");
  }

  // 3. Print for copy-paste into Vercel / production env.
  console.log("\n───────────────────────────────────────────────────────────");
  console.log("PERMANENT TOKEN (save somewhere safe — never expires):");
  console.log(permToken);
  console.log("───────────────────────────────────────────────────────────\n");
}

async function main() {
  const fresh = process.env.FRESH_USER_TOKEN?.trim();
  if (!fresh || !fresh.startsWith("EA")) {
    console.error(
      "Missing FRESH_USER_TOKEN env var. Get a fresh token from:\n" +
        "  https://developers.facebook.com/tools/explorer/\n" +
        "Select App: MafHotel Messaging\n" +
        "Permissions: business_management, whatsapp_business_management, whatsapp_business_messaging\n" +
        "Click 'Generate Access Token', copy it, then run:\n" +
        "  $env:FRESH_USER_TOKEN=\"EAAG...\"\n" +
        "  npx ts-node --project tsconfig.scripts.json scripts/bootstrap-system-user.ts",
    );
    process.exit(2);
  }

  if (!APP_ID || !APP_SECRET || !WABA_ID) {
    throw new Error("META_APP_ID / META_APP_SECRET / WHATSAPP_WABA_ID missing in env.");
  }

  console.log("=== Bootstrap System User Permanent Token ===");
  console.log("App:", APP_ID, "| WABA:", WABA_ID, "| System User:", SYSTEM_USER_NAME);

  const longLived = await step1_extendToken(fresh);
  const businessId = await step2_findBusinessId(longLived);
  const sysUser = await step3_findOrCreateSystemUser(businessId, longLived);
  await step4_assignAssets(sysUser.id, businessId, longLived);
  const permToken = await step5_generatePermanentToken(sysUser.id, longLived);
  await savePermanentToken(permToken);

  console.log("✅ Done. Local is now using the permanent token.");
  console.log("   Test locally: curl -X POST http://localhost:3001/api/whatsapp/probe");
  console.log("   For production: paste the token at https://mafhotel.com/settings/whatsapp");
}

main()
  .catch((e) => {
    console.error("\n❌ FAILED:", e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
