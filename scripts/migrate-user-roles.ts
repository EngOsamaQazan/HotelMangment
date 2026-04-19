/**
 * One-off migration: sync legacy `User.role` strings into the new `UserRole` table.
 *
 * Safe to run multiple times — existing UserRole rows are skipped.
 *
 * Usage:
 *   npx tsx scripts/migrate-user-roles.ts
 *   # or via package.json script:
 *   npm run db:migrate-user-roles
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Migrating legacy User.role → UserRole ...");

  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true },
  });

  const roles = await prisma.role.findMany({
    select: { id: true, key: true },
  });
  const roleByKey = new Map(roles.map((r) => [r.key, r.id]));

  if (roleByKey.size === 0) {
    console.error(
      "❌ No roles found in DB. Run `npm run db:seed-permissions` first.",
    );
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  let missingRole = 0;

  for (const u of users) {
    if (!u.role) {
      skipped++;
      continue;
    }
    const roleId = roleByKey.get(u.role);
    if (!roleId) {
      console.warn(
        `  ⚠️  User ${u.email}: legacy role "${u.role}" is not a known Role key — skipped`,
      );
      missingRole++;
      continue;
    }

    const existing = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: u.id, roleId } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.userRole.create({ data: { userId: u.id, roleId } });
    migrated++;
    console.log(`  ✅ ${u.email} → ${u.role}`);
  }

  console.log("");
  console.log(`Migrated:     ${migrated}`);
  console.log(`Skipped:      ${skipped} (already assigned or no legacy role)`);
  console.log(`Missing role: ${missingRole}`);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
