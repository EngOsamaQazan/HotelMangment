import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig();
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const IV_LEN = 12;

function key(): Buffer {
  const raw = (process.env.BOOKING_ENC_KEY ?? "").trim();
  if (!/^[0-9a-f]{64}$/i.test(raw)) throw new Error("BOOKING_ENC_KEY bad");
  return Buffer.from(raw, "hex");
}
function dec(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.appId || !cfg.appSecretEnc) throw new Error("No config.");
  const appId = cfg.appId;
  const appSecret = dec(cfg.appSecretEnc);
  const ver = cfg.apiVersion || "v21.0";
  const appToken = `${appId}|${appSecret}`;

  console.log("=== App-level webhook subscriptions ===");
  const r1 = await fetch(
    `https://graph.facebook.com/${ver}/${appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`,
  );
  const j1 = await r1.json();
  console.log(JSON.stringify(j1, null, 2));

  if (cfg.wabaId) {
    console.log("\n=== WABA subscribed_apps ===");
    const token = dec(cfg.accessTokenEnc!);
    const proof = crypto.createHmac("sha256", appSecret).update(token).digest("hex");
    const r2 = await fetch(
      `https://graph.facebook.com/${ver}/${cfg.wabaId}/subscribed_apps?access_token=${encodeURIComponent(token)}&appsecret_proof=${proof}`,
    );
    const j2 = await r2.json();
    console.log(JSON.stringify(j2, null, 2));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
