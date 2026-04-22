/**
 * Idempotently sync the WhatsAppConfig singleton from environment variables.
 *
 * Runs on every production deploy (see .github/workflows/deploy.yml) so the
 * server DB stays aligned with GitHub Secrets. If a secret rotates (new
 * access token, new verify token, …), the next deploy picks it up without
 * any manual UI step.
 *
 * Only non-empty env vars overwrite existing values — empty/missing vars
 * are ignored so partial configs never wipe real data.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IV_LEN = 12;

function key(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(
      "BOOKING_ENC_KEY must be 64 hex chars on the server — refuse to seed.",
    );
  }
  return Buffer.from(raw, "hex");
}
function encrypt(plain: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

function getEnv(name: string): string | null {
  const v = (process.env[name] ?? "").trim();
  return v.length > 0 ? v : null;
}

async function main() {
  const appId = getEnv("META_APP_ID");
  const appSecret = getEnv("META_APP_SECRET");
  const wabaId = getEnv("WHATSAPP_WABA_ID");
  const phoneNumberId = getEnv("WHATSAPP_PHONE_NUMBER_ID");
  const accessToken = getEnv("WHATSAPP_ACCESS_TOKEN");
  const webhookVerifyToken = getEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  const apiVersion = getEnv("WHATSAPP_API_VERSION") ?? "v21.0";

  if (!appId && !accessToken) {
    console.log("[seed-whatsapp] No WhatsApp env vars set — skipping.");
    return;
  }

  const existing = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });

  // Build a partial update: only overwrite columns when we actually have a
  // fresh value in env. Secrets get encrypted on the way in.
  const data: Record<string, unknown> = {};
  if (appId) data.appId = appId;
  if (wabaId) data.wabaId = wabaId;
  if (phoneNumberId) data.phoneNumberId = phoneNumberId;
  if (webhookVerifyToken) data.webhookVerifyToken = webhookVerifyToken;
  if (apiVersion) data.apiVersion = apiVersion;
  if (appSecret) data.appSecretEnc = encrypt(appSecret);
  if (accessToken) data.accessTokenEnc = encrypt(accessToken);

  if (existing) {
    if (Object.keys(data).length === 0) {
      console.log("[seed-whatsapp] Config row exists, no fresh env values — noop.");
      return;
    }
    await prisma.whatsAppConfig.update({ where: { id: 1 }, data });
    console.log(
      `[seed-whatsapp] Updated existing row. Columns touched: ${Object.keys(data).join(", ")}`,
    );
  } else {
    await prisma.whatsAppConfig.create({
      data: {
        id: 1,
        appId: appId ?? null,
        wabaId: wabaId ?? null,
        phoneNumberId: phoneNumberId ?? null,
        webhookVerifyToken: webhookVerifyToken ?? null,
        apiVersion,
        appSecretEnc: appSecret ? encrypt(appSecret) : null,
        accessTokenEnc: accessToken ? encrypt(accessToken) : null,
        isActive: true,
      },
    });
    console.log("[seed-whatsapp] Created fresh config row from env.");
  }
}

main()
  .catch((e) => {
    console.error("[seed-whatsapp] FAILED:", e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
