/**
 * Audit the live WhatsApp access token:
 *   • Is it a System User (permanent) token or a User (expiring) token?
 *   • When does it expire? ("Never" = what we want)
 *   • What scopes does it actually carry?
 *   • Does it still have valid error = null when debugged?
 *
 * Also does a functional probe against /me to confirm it can read the
 * graph at all. Safe to run on prod and local.
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

function fmtTs(sec: number | null | undefined): string {
  if (!sec) return "Never (permanent)";
  if (sec === 0) return "Never (permanent)";
  const d = new Date(sec * 1000);
  return `${d.toISOString()} (${d.toUTCString()})`;
}

interface DebugTokenResponse {
  data?: {
    app_id?: string;
    type?: string;
    application?: string;
    data_access_expires_at?: number;
    expires_at?: number;
    is_valid?: boolean;
    issued_at?: number;
    scopes?: string[];
    granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
    user_id?: string;
    profile_id?: string;
    error?: { code?: number; message?: string };
  };
  error?: { message?: string; code?: number };
}

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.accessTokenEnc || !cfg.appSecretEnc) {
    throw new Error("No WhatsApp config found in DB.");
  }
  const token = dec(cfg.accessTokenEnc);
  const appSecret = dec(cfg.appSecretEnc);
  const appId = cfg.appId ?? "";
  const ver = cfg.apiVersion || "v21.0";
  const appAccessToken = `${appId}|${appSecret}`;

  console.log("=== Token surface ===");
  console.log(`  length     : ${token.length} chars`);
  console.log(`  prefix     : ${token.slice(0, 6)}…${token.slice(-6)}`);
  console.log(`  app id     : ${appId}`);
  console.log(`  api ver    : ${ver}\n`);

  // 1) /debug_token — the authoritative answer on type + expiry + scopes
  console.log("=== Meta /debug_token ===");
  const debugUrl = `https://graph.facebook.com/${ver}/debug_token?input_token=${encodeURIComponent(
    token,
  )}&access_token=${encodeURIComponent(appAccessToken)}`;
  const res1 = await fetch(debugUrl);
  const dbg = (await res1.json()) as DebugTokenResponse;
  if (!res1.ok || dbg.error || dbg.data?.error) {
    console.log(JSON.stringify(dbg, null, 2));
  } else {
    const d = dbg.data!;
    console.log(`  type              : ${d.type ?? "?"}`);
    console.log(`  is_valid          : ${d.is_valid ? "✅ yes" : "❌ NO"}`);
    console.log(`  application       : ${d.application} (${d.app_id})`);
    console.log(`  issued_at         : ${fmtTs(d.issued_at)}`);
    console.log(`  expires_at        : ${fmtTs(d.expires_at)}`);
    console.log(
      `  data_expires_at   : ${fmtTs(d.data_access_expires_at)}`,
    );
    console.log(`  user_id / profile : ${d.user_id ?? d.profile_id ?? "?"}`);
    console.log(`  scopes            : ${(d.scopes ?? []).join(", ") || "(none listed)"}`);
    if (d.granular_scopes?.length) {
      console.log("  granular_scopes :");
      for (const g of d.granular_scopes) {
        console.log(
          `    • ${g.scope.padEnd(36)} target_ids=${(g.target_ids ?? []).join(", ")}`,
        );
      }
    }

    console.log("\n=== Verdict ===");
    const permanent = !d.expires_at || d.expires_at === 0;
    const isSystemUser =
      (d.type ?? "").toUpperCase().includes("SYSTEM") ||
      Boolean(d.profile_id); // SU tokens expose profile_id, user tokens expose user_id
    const requiredScopes = [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
      "business_management",
    ];
    const have = new Set((d.scopes ?? []).map((s) => s.toLowerCase()));
    const missing = requiredScopes.filter((s) => !have.has(s));

    console.log(
      `  Permanent (no expiry)           : ${permanent ? "✅" : "❌  EXPIRES " + fmtTs(d.expires_at)}`,
    );
    console.log(
      `  System User (not personal User) : ${isSystemUser ? "✅" : "❌  looks like a User token"}`,
    );
    console.log(
      `  Required scopes present         : ${missing.length === 0 ? "✅ all 3" : "❌ missing: " + missing.join(", ")}`,
    );

    if (!permanent) {
      console.log(
        "\n⚠ Token is NOT permanent — it will stop working at the time above.\n" +
          "  → Go to Business Settings → System Users → your SU → Generate new token,\n" +
          "    set Expiration = Never, pick the app, and grant the 3 scopes above.",
      );
    }
    if (!isSystemUser) {
      console.log(
        "\n⚠ This looks like a personal User token (short-lived).\n" +
          "  → Replace it with a System User permanent token.",
      );
    }
    if (missing.length) {
      console.log(
        `\n⚠ Scopes missing: ${missing.join(", ")}\n` +
          "  → Regenerate the SU token and tick all three scope checkboxes.",
      );
    }
    if (permanent && isSystemUser && missing.length === 0) {
      console.log("\n🎉 All good — production is running on a permanent SU token.");
    }
  }

  // 2) Functional probe: can we actually call the graph right now?
  console.log("\n=== Functional probe ===");
  const proof = crypto.createHmac("sha256", appSecret).update(token).digest("hex");
  const meUrl = `https://graph.facebook.com/${ver}/me?access_token=${encodeURIComponent(
    token,
  )}&appsecret_proof=${proof}`;
  const res2 = await fetch(meUrl);
  const me = await res2.json();
  console.log(JSON.stringify(me, null, 2));
}

main()
  .catch((e) => {
    console.error("\nFAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
