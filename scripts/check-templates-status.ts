/**
 * Pull the live approval status of every message template from Meta.
 * Used when the hotel owner asks "وافقت Meta ولا لسا؟" — we want to see
 * which templates are APPROVED, PENDING, or REJECTED.
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
  const d = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

interface Template {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  rejected_reason?: string;
  quality_score?: { score?: string };
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.accessTokenEnc || !cfg.appSecretEnc || !cfg.wabaId) {
    throw new Error("Config incomplete.");
  }
  const token = dec(cfg.accessTokenEnc);
  const secret = dec(cfg.appSecretEnc);
  const proof = crypto.createHmac("sha256", secret).update(token).digest("hex");
  const ver = cfg.apiVersion || "v21.0";

  const url = `https://graph.facebook.com/${ver}/${cfg.wabaId}/message_templates?fields=id,name,status,language,category,rejected_reason,quality_score&limit=100&access_token=${encodeURIComponent(
    token,
  )}&appsecret_proof=${proof}`;
  const res = await fetch(url);
  const j = (await res.json()) as
    | { data: Template[] }
    | { error: { message: string } };
  if ("error" in j) {
    throw new Error(j.error.message);
  }
  const rows = j.data || [];
  console.log(`\n=== Message Templates (${rows.length}) ===\n`);
  const byStatus: Record<string, Template[]> = {};
  for (const t of rows) {
    byStatus[t.status] = byStatus[t.status] || [];
    byStatus[t.status].push(t);
  }
  for (const status of Object.keys(byStatus).sort()) {
    console.log(`\n--- ${status} (${byStatus[status].length}) ---`);
    for (const t of byStatus[status]) {
      console.log(
        `  • ${t.name.padEnd(30)} ${t.language.padEnd(6)} ${t.category}${
          t.rejected_reason ? "  (reason: " + t.rejected_reason + ")" : ""
        }${t.quality_score?.score ? "  [Q: " + t.quality_score.score + "]" : ""}`,
      );
    }
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
