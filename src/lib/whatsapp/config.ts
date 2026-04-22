import "server-only";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/booking/encryption";

/**
 * Resolved WhatsApp configuration — everything the client wrapper needs to
 * talk to the Graph API and verify incoming webhooks. `accessToken` and
 * `appSecret` are returned DECRYPTED (server-side only); never send these
 * over the wire.
 */
export interface WhatsAppRuntimeConfig {
  appId: string;
  appSecret: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  accessToken: string;
  webhookVerifyToken: string;
  apiVersion: string;
  isActive: boolean;
}

/**
 * Public (safe) view of the config — used by the settings UI. Secrets are
 * returned as booleans ("has value or not") so we never leak them to the
 * browser.
 */
export interface WhatsAppPublicConfig {
  appId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  apiVersion: string;
  isActive: boolean;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  hasWebhookVerifyToken: boolean;
  webhookUrl: string;
  lastVerifiedAt: Date | null;
  lastVerifyOk: boolean | null;
  lastError: string | null;
}

const SINGLETON_ID = 1;

/**
 * Return the singleton DB config row. Creates it on first access, seeded
 * from environment variables so fresh installs work out of the box.
 */
export async function getOrCreateConfig() {
  const existing = await prisma.whatsAppConfig.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (existing) return existing;

  const envToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || "";
  const envSecret = process.env.META_APP_SECRET?.trim() || "";
  return prisma.whatsAppConfig.create({
    data: {
      id: SINGLETON_ID,
      appId: process.env.META_APP_ID?.trim() || null,
      appSecretEnc: envSecret ? encryptSecret(envSecret) : null,
      wabaId: process.env.WHATSAPP_WABA_ID?.trim() || null,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || null,
      accessTokenEnc: envToken ? encryptSecret(envToken) : null,
      webhookVerifyToken:
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || null,
      apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || "v21.0",
    },
  });
}

/** Load the fully-resolved runtime config. Throws if required fields missing. */
export async function loadRuntimeConfig(): Promise<WhatsAppRuntimeConfig> {
  const row = await getOrCreateConfig();

  const accessToken = row.accessTokenEnc ? decryptSecret(row.accessTokenEnc) : "";
  const appSecret = row.appSecretEnc ? decryptSecret(row.appSecretEnc) : "";

  if (!row.phoneNumberId || !accessToken) {
    throw new Error(
      "WhatsApp غير مُهيّأ بعد — اذهب إلى الإعدادات وأدخل Access Token و Phone Number ID.",
    );
  }

  return {
    appId: row.appId ?? "",
    appSecret,
    wabaId: row.wabaId ?? "",
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    accessToken,
    webhookVerifyToken: row.webhookVerifyToken ?? "",
    apiVersion: row.apiVersion || "v21.0",
    isActive: row.isActive,
  };
}

/** Build the "safe" view of the config for the settings UI. */
export async function loadPublicConfig(): Promise<WhatsAppPublicConfig> {
  const row = await getOrCreateConfig();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    "http://localhost:3000";
  return {
    appId: row.appId ?? "",
    wabaId: row.wabaId ?? "",
    phoneNumberId: row.phoneNumberId ?? "",
    displayPhoneNumber: row.displayPhoneNumber,
    apiVersion: row.apiVersion || "v21.0",
    isActive: row.isActive,
    hasAccessToken: !!row.accessTokenEnc,
    hasAppSecret: !!row.appSecretEnc,
    hasWebhookVerifyToken: !!row.webhookVerifyToken,
    webhookUrl: `${siteUrl}/api/whatsapp/webhook`,
    lastVerifiedAt: row.lastVerifiedAt,
    lastVerifyOk: row.lastVerifyOk,
    lastError: row.lastError,
  };
}

/** Patch shape for the settings UI. All fields optional; secrets are stripped
 *  when empty to avoid overwriting a valid stored value with "". */
export interface UpdateConfigInput {
  appId?: string | null;
  appSecret?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  accessToken?: string | null;
  webhookVerifyToken?: string | null;
  apiVersion?: string | null;
  isActive?: boolean;
}

export async function updateConfig(patch: UpdateConfigInput) {
  const data: Record<string, unknown> = {};

  if (patch.appId !== undefined) data.appId = (patch.appId || "").trim() || null;
  if (patch.wabaId !== undefined) data.wabaId = (patch.wabaId || "").trim() || null;
  if (patch.phoneNumberId !== undefined)
    data.phoneNumberId = (patch.phoneNumberId || "").trim() || null;
  if (patch.displayPhoneNumber !== undefined)
    data.displayPhoneNumber = (patch.displayPhoneNumber || "").trim() || null;
  if (patch.webhookVerifyToken !== undefined)
    data.webhookVerifyToken = (patch.webhookVerifyToken || "").trim() || null;
  if (patch.apiVersion !== undefined)
    data.apiVersion = (patch.apiVersion || "").trim() || "v21.0";
  if (patch.isActive !== undefined) data.isActive = !!patch.isActive;

  // Only overwrite secrets when a new value is explicitly provided.
  if (typeof patch.accessToken === "string" && patch.accessToken.trim()) {
    data.accessTokenEnc = encryptSecret(patch.accessToken.trim());
  }
  if (typeof patch.appSecret === "string" && patch.appSecret.trim()) {
    data.appSecretEnc = encryptSecret(patch.appSecret.trim());
  }

  await getOrCreateConfig(); // ensure row exists
  await prisma.whatsAppConfig.update({
    where: { id: SINGLETON_ID },
    data,
  });
}

export async function markVerification(ok: boolean, err?: string) {
  await getOrCreateConfig();
  await prisma.whatsAppConfig.update({
    where: { id: SINGLETON_ID },
    data: {
      lastVerifiedAt: new Date(),
      lastVerifyOk: ok,
      lastError: ok ? null : (err ?? null),
    },
  });
}
