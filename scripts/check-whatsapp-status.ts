/**
 * Quick status dump — shows current WhatsApp config health, template
 * approval state, and recent messages. Run locally with:
 *   npx ts-node --project tsconfig.scripts.json scripts/check-whatsapp-status.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  console.log("=== WhatsApp Config ===");
  console.log({
    appId: cfg?.appId ?? null,
    wabaId: cfg?.wabaId ?? null,
    phoneNumberId: cfg?.phoneNumberId ?? null,
    displayPhoneNumber: cfg?.displayPhoneNumber ?? null,
    isActive: cfg?.isActive ?? null,
    hasAccessToken: !!cfg?.accessTokenEnc,
    hasAppSecret: !!cfg?.appSecretEnc,
    hasWebhookVerifyToken: !!cfg?.webhookVerifyToken,
    lastVerifiedAt: cfg?.lastVerifiedAt ?? null,
    lastVerifyOk: cfg?.lastVerifyOk ?? null,
    lastError: cfg?.lastError ?? null,
  });

  const tpls = await prisma.whatsAppTemplate.findMany({
    orderBy: { lastSyncedAt: "desc" },
  });
  console.log(`\n=== Templates (${tpls.length}) ===`);
  for (const t of tpls) {
    console.log(
      `- ${t.name.padEnd(32)} ${t.language.padEnd(6)} ${t.category.padEnd(12)} ${t.status}${
        t.rejectionReason ? ` — ${t.rejectionReason}` : ""
      }`,
    );
  }

  const msgStats = await prisma.whatsAppMessage.groupBy({
    by: ["direction", "status"],
    _count: true,
  });
  console.log("\n=== Messages by direction/status ===");
  for (const r of msgStats) {
    console.log(`- ${r.direction.padEnd(10)} ${r.status.padEnd(12)} ${r._count}`);
  }

  const recent = await prisma.whatsAppMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      createdAt: true,
      direction: true,
      status: true,
      type: true,
      contactPhone: true,
      body: true,
      templateName: true,
      errorMessage: true,
    },
  });
  console.log("\n=== Last 5 messages ===");
  for (const m of recent) {
    const preview = (m.body ?? m.templateName ?? "").slice(0, 60);
    console.log(
      `${m.createdAt.toISOString()}  ${m.direction.padEnd(9)} ${m.type.padEnd(9)} ${m.status.padEnd(10)} ${m.contactPhone.padEnd(15)} ${preview}${
        m.errorMessage ? `  [ERR: ${m.errorMessage}]` : ""
      }`,
    );
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
