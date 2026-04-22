/**
 * Point Meta's App-level webhook at https://mafhotel.com.
 *
 * Context: outgoing (send) only needs a valid access token; incoming
 * (webhook) only fires if the Meta App's subscription callback_url is
 * the URL you want to receive at. We used to point it at a cloudflared
 * tunnel during local testing, which is why prod isn't receiving even
 * though /api/whatsapp/webhook on mafhotel.com returns 200 to probes.
 *
 * This script:
 *   1. reads current /{APP_ID}/subscriptions to show what's configured
 *   2. re-registers the subscription with callback_url = prod URL
 *   3. re-subscribes the WABA to the app (idempotent)
 *   4. sends a "webhook ping" hint via the same subscription endpoint
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IV_LEN = 12;
const PROD_WEBHOOK_URL =
  process.env.PROD_WEBHOOK_URL ??
  "https://mafhotel.com/api/whatsapp/webhook";

function key(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error("BOOKING_ENC_KEY must be 64 hex chars.");
  }
  return Buffer.from(raw, "hex");
}

function decrypt(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

function appsecretProof(token: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

async function graphGet(
  url: string,
  params: Record<string, string>,
): Promise<unknown> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${qs}`);
  const text = await res.text();
  const j = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}: ${JSON.stringify(j)}`);
  return j;
}

async function graphPost(
  url: string,
  params: Record<string, string>,
): Promise<unknown> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  const j = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}: ${JSON.stringify(j)}`);
  return j;
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg || !cfg.accessTokenEnc || !cfg.appSecretEnc || !cfg.appId) {
    throw new Error("WhatsAppConfig incomplete (need appId, accessToken, appSecret).");
  }
  const token = decrypt(cfg.accessTokenEnc);
  const secret = decrypt(cfg.appSecretEnc);
  const verifyToken = cfg.webhookVerifyToken ?? "";
  if (!verifyToken) throw new Error("webhookVerifyToken is empty.");

  const appId = cfg.appId;
  const wabaId = cfg.wabaId;
  const v = cfg.apiVersion || "v21.0";
  const proof = appsecretProof(token, secret);
  const appAccessToken = `${appId}|${secret}`; // For subscription endpoints.

  console.log("── 1/4  Current app subscriptions ──");
  const current = (await graphGet(
    `https://graph.facebook.com/${v}/${appId}/subscriptions`,
    { access_token: appAccessToken },
  )) as { data: Array<{ object: string; callback_url: string; fields: Array<{ name: string }> }> };
  for (const sub of current.data ?? []) {
    console.log(`    ${sub.object}: ${sub.callback_url}`);
    console.log(`      fields: ${sub.fields.map((f) => f.name).join(", ")}`);
  }

  console.log(`\n── 2/4  Re-registering subscription → ${PROD_WEBHOOK_URL} ──`);
  const resub = await graphPost(
    `https://graph.facebook.com/${v}/${appId}/subscriptions`,
    {
      object: "whatsapp_business_account",
      callback_url: PROD_WEBHOOK_URL,
      verify_token: verifyToken,
      // Stick to the three fields the App currently has permission for.
      // Adding more triggers 1929002 "Invalid Permissions" until Business
      // Verification is complete.
      fields: [
        "messages",
        "message_template_status_update",
        "account_update",
      ].join(","),
      include_values: "true",
      access_token: appAccessToken,
    },
  );
  console.log("    ", resub);

  if (wabaId) {
    console.log("\n── 3/4  Ensuring WABA is subscribed to the app ──");
    const r = await graphPost(
      `https://graph.facebook.com/${v}/${wabaId}/subscribed_apps`,
      {
        access_token: token,
        appsecret_proof: proof,
      },
    );
    console.log("    ", r);
  }

  console.log("\n── 4/4  Verifying new callback ──");
  const after = (await graphGet(
    `https://graph.facebook.com/${v}/${appId}/subscriptions`,
    { access_token: appAccessToken },
  )) as { data: Array<{ object: string; callback_url: string; active: boolean }> };
  for (const sub of after.data ?? []) {
    console.log(
      `    ${sub.object}: ${sub.callback_url}  (active: ${sub.active})`,
    );
  }

  console.log("\n✅ Done. Send a WhatsApp message to your business number now.");
  console.log(
    "   If it still doesn't arrive on prod, check /opt/mafhotel.com logs for\n" +
      "   any 403 on /api/whatsapp/webhook (means verify_token mismatch).",
  );
}

main()
  .catch((e) => {
    console.error("❌", e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
