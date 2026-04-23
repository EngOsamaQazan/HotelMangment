/**
 * Inspect the last outbound WhatsApp sends + Meta's messaging limits.
 * Useful when "أرسلت لرقم جديد ولم تصل" to understand exactly why.
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
  console.log("=== Last 10 outbound messages (local DB) ===\n");
  const recent = await prisma.whatsAppMessage.findMany({
    where: { direction: "OUTBOUND" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const m of recent) {
    const ts = m.createdAt.toISOString().replace("T", " ").slice(0, 19);
    const raw = m.rawJson as Record<string, unknown> | null;
    const errorCode = raw?.errorCode ?? raw?.error_code ?? "";
    const errorMsg =
      raw?.errorMessage ?? raw?.error_message ?? raw?.error ?? "";
    const tplName = raw?.templateName ?? raw?.template_name ?? "";
    console.log(
      `${ts}  to=${m.contactPhone}  type=${m.type}${tplName ? "(" + tplName + ")" : ""}  status=${m.status}${errorCode ? "  err=" + errorCode : ""}`,
    );
    if (m.body) console.log(`    body: ${String(m.body).slice(0, 100)}`);
    if (errorMsg) console.log(`    → ${String(errorMsg).slice(0, 300)}`);
    if (m.pricingCategory) console.log(`    pricing: ${m.pricingCategory}`);
  }

  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.accessTokenEnc || !cfg.appSecretEnc || !cfg.phoneNumberId) {
    throw new Error("Config incomplete.");
  }
  const token = dec(cfg.accessTokenEnc);
  const secret = dec(cfg.appSecretEnc);
  const proof = crypto.createHmac("sha256", secret).update(token).digest("hex");
  const ver = cfg.apiVersion || "v21.0";

  console.log("\n=== Phone number messaging limits (Meta) ===\n");
  const url = `https://graph.facebook.com/${ver}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,name_status,status,account_mode,messaging_limit_tier,throughput,is_official_business_account,platform_type&access_token=${encodeURIComponent(token)}&appsecret_proof=${proof}`;
  const res = await fetch(url);
  const j = await res.json();
  console.log(JSON.stringify(j, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
