/**
 * CLI: send an approved WhatsApp template to any number, without going
 * through the UI. Useful to prove the API works end-to-end when the
 * recipient hasn't messaged us (so free-form text is not allowed).
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/send-template-cli.ts \
 *     --to 962799999999 --name hello_world --lang en_US
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/send-template-cli.ts \
 *     --to 962799999999 --name welcome_guest_ar --lang ar --params "أحمد,1234"
 *
 *   # List approved templates only
 *   npx ts-node --project tsconfig.scripts.json scripts/send-template-cli.ts --list
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

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.accessTokenEnc || !cfg.appSecretEnc || !cfg.phoneNumberId) {
    throw new Error("WhatsApp config incomplete in DB.");
  }
  const token = dec(cfg.accessTokenEnc);
  const secret = dec(cfg.appSecretEnc);
  const proof = crypto.createHmac("sha256", secret).update(token).digest("hex");
  const ver = cfg.apiVersion || "v21.0";

  if (hasFlag("list") || !arg("to")) {
    const url = `https://graph.facebook.com/${ver}/${cfg.wabaId}/message_templates?fields=name,status,language,category&limit=100&access_token=${encodeURIComponent(token)}&appsecret_proof=${proof}`;
    const r = await fetch(url);
    const j = (await r.json()) as {
      data?: Array<{ name: string; status: string; language: string; category: string }>;
    };
    console.log("\n=== Approved templates you can use ===\n");
    for (const t of (j.data || []).filter((x) => x.status === "APPROVED")) {
      console.log(`  • ${t.name.padEnd(28)} ${t.language.padEnd(6)} ${t.category}`);
    }
    console.log(
      "\nExample:\n  --to 96279XXXXXXX --name hello_world --lang en_US\n",
    );
    return;
  }

  const to = (arg("to") ?? "").replace(/\D/g, "");
  const name = arg("name") ?? "hello_world";
  const language = arg("lang") ?? (name.endsWith("_ar") ? "ar" : "en_US");
  const rawParams = arg("params");
  const params =
    rawParams && rawParams.length > 0
      ? rawParams.split(",").map((p) => ({ type: "text", text: p.trim() }))
      : null;

  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
    },
  };
  if (params) {
    (body.template as Record<string, unknown>).components = [
      { type: "body", parameters: params },
    ];
  }

  console.log("→ Sending template to", to);
  console.log("  name  :", name);
  console.log("  lang  :", language);
  if (params) console.log("  params:", params.map((p) => p.text).join(", "));
  const url = `https://graph.facebook.com/${ver}/${cfg.phoneNumberId}/messages?access_token=${encodeURIComponent(token)}&appsecret_proof=${proof}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    j = text;
  }
  if (!res.ok) {
    console.error("\n❌ Meta rejected the send:");
    console.error(JSON.stringify(j, null, 2));
    process.exit(1);
  }
  console.log("\n✅ Sent successfully!");
  console.log(JSON.stringify(j, null, 2));
  console.log(
    "\n(Check your phone — the template message should arrive within a few seconds.)",
  );
}

main()
  .catch((e) => {
    console.error("\nFAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
