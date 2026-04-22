/**
 * Delete the WhatsAppConfig row so the live server will recreate it with
 * its own in-process BOOKING_ENC_KEY on the next request.
 *
 *   npx ts-node --project tsconfig.scripts.json scripts/wipe-whatsapp-config.ts
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  const res = await prisma.whatsAppConfig.deleteMany({ where: { id: 1 } });
  console.log("Deleted WhatsAppConfig rows:", res.count);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
