/**
 * Re-seeds WhatsAppConfig from .env.local. Needed because
 * getOrCreateConfig() only reads env on first insert — after rotating
 * WHATSAPP_ACCESS_TOKEN / META_APP_SECRET, run this to sync the DB.
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/reset-whatsapp-config.ts
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });
loadEnv({ path: path.resolve(process.cwd(), ".env") });

const ALGO = "aes-256-gcm" as const;
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.BOOKING_ENC_KEY;
  if (raw) {
    if (!/^[0-9a-f]{64}$/i.test(raw)) {
      throw new Error("BOOKING_ENC_KEY must be 64 hex chars (32 bytes)");
    }
    return Buffer.from(raw, "hex");
  }
  const fallback = process.env.NEXTAUTH_SECRET || "dev-insecure-secret";
  return crypto.createHash("sha256").update(fallback).digest();
}

function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

async function main() {
  const prisma = new PrismaClient();

  const envToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
  const envSecret = process.env.META_APP_SECRET?.trim() || "";
  const envVerify = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || "";

  const data = {
    id: 1,
    appId: process.env.META_APP_ID?.trim() || null,
    appSecretEnc: envSecret ? encryptSecret(envSecret) : null,
    wabaId: process.env.WHATSAPP_WABA_ID?.trim() || null,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null,
    accessTokenEnc: envToken ? encryptSecret(envToken) : null,
    webhookVerifyToken: envVerify || null,
    apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || "v21.0",
  };

  await prisma.whatsAppConfig.upsert({
    where: { id: 1 },
    create: data,
    update: {
      appId: data.appId,
      appSecretEnc: data.appSecretEnc,
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      accessTokenEnc: data.accessTokenEnc,
      webhookVerifyToken: data.webhookVerifyToken,
      apiVersion: data.apiVersion,
      lastError: null,
      lastVerifyOk: null,
    },
  });

  const row = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  console.log("WhatsAppConfig synced from .env.local:");
  console.log({
    id: row?.id,
    appId: row?.appId,
    wabaId: row?.wabaId,
    phoneNumberId: row?.phoneNumberId,
    apiVersion: row?.apiVersion,
    hasAccessToken: !!row?.accessTokenEnc,
    hasAppSecret: !!row?.appSecretEnc,
    hasWebhookVerifyToken: !!row?.webhookVerifyToken,
    isActive: row?.isActive,
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
