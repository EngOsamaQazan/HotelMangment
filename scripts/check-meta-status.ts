/**
 * Probe Meta for the live state of our integration: phone-number metadata,
 * WABA subscribed apps, and (indirectly) webhook URL via the app's
 * subscribed_apps edge. Output is the single-pane view we reference when
 * reporting status to the hotel owner.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ENC_ALG = "aes-256-gcm";
const IV_LEN = 12;

function getKey(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error("BOOKING_ENC_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(raw, "hex");
}
function dec(packed: string): string {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const d = crypto.createDecipheriv(ENC_ALG, getKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

async function gget<T = unknown>(
  path: string,
  token: string,
  proof: string,
): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://graph.facebook.com${path}${sep}access_token=${encodeURIComponent(
    token,
  )}&appsecret_proof=${proof}`;
  const res = await fetch(url);
  const j = (await res.json()) as { error?: { message: string; code?: number } } & T;
  if (!res.ok || (j as { error?: { message: string } }).error) {
    const err = (j as { error?: { message: string; code?: number } }).error;
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return j as T;
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.accessTokenEnc || !cfg.appSecretEnc) {
    throw new Error("Config incomplete.");
  }
  const token = dec(cfg.accessTokenEnc);
  const secret = dec(cfg.appSecretEnc);
  const proof = crypto.createHmac("sha256", secret).update(token).digest("hex");
  const ver = cfg.apiVersion || "v21.0";

  console.log("=== Phone number ===");
  const phone = await gget<Record<string, unknown>>(
    `/${ver}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,name_status,messaging_limit_tier,status,account_mode,is_official_business_account,platform_type`,
    token,
    proof,
  );
  console.log(phone);

  console.log("\n=== WABA subscribed apps (webhook subscription) ===");
  try {
    const subs = await gget<{ data?: Array<Record<string, unknown>> }>(
      `/${ver}/${cfg.wabaId}/subscribed_apps`,
      token,
      proof,
    );
    if (!subs.data || subs.data.length === 0) {
      console.log("NONE — you must POST /subscribed_apps on this WABA.");
    } else {
      for (const s of subs.data) console.log(s);
    }
  } catch (e) {
    console.log("(error)", (e as Error).message);
  }

  console.log("\n=== WABA info ===");
  const waba = await gget<Record<string, unknown>>(
    `/${ver}/${cfg.wabaId}?fields=id,name,business_verification_status,account_review_status,currency,message_template_namespace,timezone_id,owner_business_info`,
    token,
    proof,
  );
  console.log(waba);

  console.log("\n=== App info (webhook URL is configured at App level) ===");
  try {
    const app = await gget<Record<string, unknown>>(
      `/${ver}/${cfg.appId}?fields=id,name,namespace,privacy_policy_url,terms_of_service_url,website_url,app_domains,category`,
      token,
      proof,
    );
    console.log(app);
  } catch (e) {
    console.log("(error)", (e as Error).message);
  }

  console.log("\n=== App subscriptions (object=whatsapp_business_account) ===");
  try {
    const subs = await gget<{ data?: Array<Record<string, unknown>> }>(
      `/${ver}/${cfg.appId}/subscriptions`,
      token,
      proof,
    );
    const rows = subs.data ?? [];
    if (rows.length === 0) {
      console.log("NONE — Meta has no callback_url registered for this app.");
    }
    for (const r of rows) console.log(r);
  } catch (e) {
    console.log("(error)", (e as Error).message);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
