/**
 * Inspect an access token against Meta's debug_token endpoint so we can
 * answer "is this a System-User permanent token or a 2-hour user token?".
 *
 * Runs against the token currently stored in WhatsAppConfig (the one our
 * local app is actually using). Prints type, expiry, scopes, and issuer.
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IV_LEN = 12;

function getKey(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  return Buffer.from(raw, "hex");
}
function dec(packed: string): string {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const d = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.accessTokenEnc || !cfg.appId || !cfg.appSecretEnc) {
    throw new Error("Config incomplete.");
  }
  const token = dec(cfg.accessTokenEnc);
  const appSecret = dec(cfg.appSecretEnc);

  // debug_token requires an app access token = app_id|app_secret
  const appAccessToken = `${cfg.appId}|${appSecret}`;

  const url =
    `https://graph.facebook.com/debug_token` +
    `?input_token=${encodeURIComponent(token)}` +
    `&access_token=${encodeURIComponent(appAccessToken)}`;

  const res = await fetch(url);
  const json = (await res.json()) as {
    data?: {
      app_id?: string;
      type?: string;
      application?: string;
      data_access_expires_at?: number;
      expires_at?: number;
      issued_at?: number;
      is_valid?: boolean;
      scopes?: string[];
      user_id?: string;
      error?: { message: string; code?: number; subcode?: number };
    };
  };

  const d = json.data;
  if (!d) {
    console.log("No data returned:", json);
    return;
  }

  console.log("=== Token metadata ===");
  console.log("app:        ", d.application, `(${d.app_id})`);
  console.log("type:       ", d.type);
  console.log("valid:      ", d.is_valid);
  console.log("user_id:    ", d.user_id ?? "(none — System User tokens often hide this)");
  console.log(
    "issued_at:  ",
    d.issued_at ? new Date(d.issued_at * 1000).toISOString() : "(unknown)",
  );
  console.log(
    "expires_at: ",
    d.expires_at === 0
      ? "NEVER (✅ permanent System User token)"
      : d.expires_at
        ? new Date(d.expires_at * 1000).toISOString()
        : "(unknown)",
  );
  console.log(
    "data_access_expires_at:",
    d.data_access_expires_at
      ? new Date(d.data_access_expires_at * 1000).toISOString()
      : "(none)",
  );
  console.log("scopes:     ", d.scopes?.join(", ") ?? "(none)");
  if (d.error) {
    console.log("ERROR:", d.error);
  }

  console.log("\nToken prefix:", token.slice(0, 16) + "…");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
