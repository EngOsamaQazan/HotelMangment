/**
 * CLI equivalent of the "نشر إلى الإنتاج" button in /settings/whatsapp.
 *
 * Reads WhatsAppConfig from the local DB, encrypts and uploads the 7
 * relevant secrets to GitHub Actions, dispatches deploy.yml, and
 * repoints the Meta App-level webhook at mafhotel.com — end-to-end,
 * non-interactive, safe to re-run.
 *
 * Usage:  npx ts-node --project tsconfig.scripts.json scripts/publish-to-production.ts
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();

import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/booking/encryption";
import {
  setRepoSecrets,
  dispatchWorkflow,
  getLatestWorkflowRun,
} from "../src/lib/github/secrets";

const prisma = new PrismaClient();
const PROD_WEBHOOK_URL =
  process.env.PROD_WEBHOOK_URL ?? "https://mafhotel.com/api/whatsapp/webhook";

async function pointWebhookAt(
  appId: string,
  appSecret: string,
  verifyToken: string,
  callbackUrl: string,
  apiVersion: string,
): Promise<string> {
  const appAccessToken = `${appId}|${appSecret}`;
  const body = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: "messages,message_template_status_update,account_update",
    include_values: "true",
    access_token: appAccessToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/${apiVersion}/${appId}/subscriptions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const text = await res.text();
  const j = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = j?.error?.error_user_msg || j?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta rejected webhook update: ${msg}`);
  }
  return callbackUrl;
}

async function main() {
  for (const v of ["GITHUB_PAT", "GITHUB_REPO"]) {
    if (!(process.env[v] ?? "").trim()) {
      throw new Error(`${v} is not set. Cannot publish without it.`);
    }
  }

  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg) throw new Error("No WhatsAppConfig row — save settings first.");

  const accessToken = cfg.accessTokenEnc ? decryptSecret(cfg.accessTokenEnc) : "";
  const appSecret = cfg.appSecretEnc ? decryptSecret(cfg.appSecretEnc) : "";

  const payload: Record<string, string | null> = {
    META_APP_ID: cfg.appId,
    META_APP_SECRET: appSecret || null,
    WHATSAPP_WABA_ID: cfg.wabaId,
    WHATSAPP_PHONE_NUMBER_ID: cfg.phoneNumberId,
    WHATSAPP_ACCESS_TOKEN: accessToken || null,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: cfg.webhookVerifyToken,
    WHATSAPP_API_VERSION: cfg.apiVersion || "v21.0",
  };

  for (const k of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) {
    if (!payload[k]) throw new Error(`${k} is empty in WhatsAppConfig.`);
  }

  console.log("1/3  Uploading GitHub Actions secrets…");
  const secResult = await setRepoSecrets(payload);
  console.log("     updated :", secResult.updated.join(", "));
  if (secResult.skipped.length) {
    console.log("     skipped :", secResult.skipped.join(", "));
  }

  console.log("\n2/3  Dispatching deploy.yml on main…");
  await dispatchWorkflow("deploy.yml", "main");
  await new Promise((r) => setTimeout(r, 2500));
  const run = await getLatestWorkflowRun("deploy.yml").catch(() => null);
  if (run) {
    console.log("     run :", run.html_url, `(${run.status})`);
  } else {
    console.log("     (no run url available yet — check Actions tab)");
  }

  console.log("\n3/3  Repointing Meta webhook at", PROD_WEBHOOK_URL, "…");
  if (cfg.appId && appSecret && cfg.webhookVerifyToken) {
    const url = await pointWebhookAt(
      cfg.appId,
      appSecret,
      cfg.webhookVerifyToken,
      PROD_WEBHOOK_URL,
      cfg.apiVersion || "v21.0",
    );
    console.log("     webhook now at :", url);
  } else {
    console.log("     SKIPPED — missing appId/appSecret/verifyToken");
  }

  console.log("\nDone. Wait ~3 minutes for the deploy to finish, then retest.");
}

main()
  .catch((e) => {
    console.error("\nFAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
