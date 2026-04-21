/**
 * CLI entrypoint that re-syncs the permissions system from the code registry.
 *
 * The actual logic lives in `src/lib/permissions/sync.ts` so the same code
 * runs when the admin clicks "تحديث الصلاحيات" in the roles UI (which hits
 * `POST /api/permissions/sync`). See that file for details.
 *
 * Run manually with: `npm run db:seed-permissions`
 */

import { PrismaClient } from "@prisma/client";
import { syncPermissionsFromRegistry } from "../src/lib/permissions/sync";

const prisma = new PrismaClient();

export async function seedPermissions() {
  return syncPermissionsFromRegistry(prisma, {
    migrateLegacyUserRoles: true,
    log: true,
  });
}

if (require.main === module) {
  seedPermissions()
    .catch((e) => {
      console.error("❌ خطأ في مزامنة الصلاحيات:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
