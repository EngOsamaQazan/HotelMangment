/**
 * Decrypt the WhatsAppConfig row and compare against .env.local.
 * Used to debug "Unsupported state or unable to authenticate data" errors.
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/verify-whatsapp-decrypt.ts
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
  if (raw && raw.trim().length > 0) {
    if (!/^[0-9a-f]{64}$/i.test(raw)) {
      throw new Error("BOOKING_ENC_KEY must be 64 hex chars (32 bytes)");
    }
    return Buffer.from(raw, "hex");
  }
  const fallback = process.env.NEXTAUTH_SECRET || "dev-insecure-secret";
  return crypto.createHash("sha256").update(fallback).digest();
}

function decrypt(enc: string): string {
  const buf = Buffer.from(enc, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ct = buf.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

async function main() {
  const prisma = new PrismaClient();
  const row = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!row) {
    console.error("No WhatsAppConfig row!");
    process.exit(1);
  }

  const envToken = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  const envSecret = (process.env.META_APP_SECRET ?? "").trim();

  const dbToken = row.accessTokenEnc ? decrypt(row.accessTokenEnc) : "";
  const dbSecret = row.appSecretEnc ? decrypt(row.appSecretEnc) : "";

  console.log("── Compare DB (decrypted) ↔ .env.local ──");
  console.log(
    "Access Token match:",
    dbToken === envToken,
    "| env length:",
    envToken.length,
    "| db length:",
    dbToken.length,
  );
  console.log(
    "App Secret match:",
    dbSecret === envSecret,
    "| env length:",
    envSecret.length,
    "| db length:",
    dbSecret.length,
  );
  console.log("DB token prefix:", dbToken.slice(0, 20) + "…");
  console.log("env token prefix:", envToken.slice(0, 20) + "…");

  // Try a live request
  const proof = crypto
    .createHmac("sha256", dbSecret)
    .update(dbToken)
    .digest("hex");
  const url = `https://graph.facebook.com/v21.0/${row.phoneNumberId}?access_token=${dbToken}&appsecret_proof=${proof}`;
  const res = await fetch(url);
  const text = await res.text();
  console.log("\n── Graph API probe (using decrypted DB values) ──");
  console.log("status:", res.status);
  console.log("body:", text.slice(0, 400));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
