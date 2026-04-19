/**
 * Seeds / syncs the permissions system from the code registry.
 *
 * - Upserts every Resource + Permission in the registry.
 * - Deactivates (does NOT delete) permissions that disappeared from the code.
 * - Creates/updates the default system roles from DEFAULT_ROLES.
 * - Migrates legacy `User.role` string into `UserRole` rows (idempotent).
 *
 * Safe to re-run anytime. Call via `npm run db:seed:perms`.
 */

import { PrismaClient } from "@prisma/client";
import {
  RESOURCES,
  DEFAULT_ROLES,
  ACTION_LABELS,
  expandPermissions,
  permissionKey,
} from "../src/lib/permissions/registry";

const prisma = new PrismaClient();

export async function seedPermissions() {
  console.log("🔐 مزامنة الصلاحيات من الـ registry...");

  // ───────────── Resources + Permissions ─────────────
  const seenPermissionKeys = new Set<string>();

  for (const res of RESOURCES) {
    const resource = await prisma.resource.upsert({
      where: { key: res.key },
      update: {
        label: res.label,
        category: res.category,
        sortOrder: res.sortOrder ?? 0,
        isActive: true,
        description: res.description ?? null,
      },
      create: {
        key: res.key,
        label: res.label,
        category: res.category,
        sortOrder: res.sortOrder ?? 0,
        description: res.description ?? null,
      },
    });

    const allActions: { action: string; label: string }[] = [
      ...res.actions.map((a) => ({
        action: a,
        label: ACTION_LABELS[a] ?? a,
      })),
      ...(res.extraActions ?? []).map((x) => ({
        action: x.key,
        label: x.label,
      })),
    ];

    for (const { action, label } of allActions) {
      const pKey = permissionKey(res.key, action);
      seenPermissionKeys.add(pKey);
      await prisma.permission.upsert({
        where: { key: pKey },
        update: {
          resourceId: resource.id,
          action,
          label: `${res.label} — ${label}`,
          isActive: true,
        },
        create: {
          key: pKey,
          resourceId: resource.id,
          action,
          label: `${res.label} — ${label}`,
        },
      });
    }
  }

  // Deactivate permissions that no longer exist in the registry.
  const deactivated = await prisma.permission.updateMany({
    where: { key: { notIn: Array.from(seenPermissionKeys) }, isActive: true },
    data: { isActive: false },
  });
  if (deactivated.count > 0) {
    console.log(`  ⚠️  تم تعطيل ${deactivated.count} صلاحية غير موجودة بالكود`);
  }

  console.log(
    `  ✅ ${RESOURCES.length} resources + ${seenPermissionKeys.size} permissions`,
  );

  // ───────────── Default Roles ─────────────
  for (const preset of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { key: preset.key },
      update: {
        name: preset.name,
        description: preset.description,
        isSystem: preset.isSystem,
        isActive: true,
      },
      create: {
        key: preset.key,
        name: preset.name,
        description: preset.description,
        isSystem: preset.isSystem,
      },
    });

    const keys = expandPermissions(preset.permissions);
    const perms = await prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true },
    });

    // Replace role's permissions with the preset's set (system roles only —
    // custom roles shouldn't be touched).
    if (preset.isSystem) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (perms.length) {
        await prisma.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
    } else {
      // New custom role — just add missing permissions.
      for (const p of perms) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: p.id },
          },
          update: {},
          create: { roleId: role.id, permissionId: p.id },
        });
      }
    }
    console.log(`  ✅ Role ${preset.key}: ${perms.length} perms`);
  }

  // ───────────── Migrate legacy User.role → UserRole ─────────────
  const users = await prisma.user.findMany({
    select: { id: true, role: true },
  });
  const roleByKey = new Map(
    (await prisma.role.findMany({ select: { id: true, key: true } })).map(
      (r) => [r.key, r.id],
    ),
  );
  let migrated = 0;
  for (const u of users) {
    if (!u.role) continue;
    const roleId = roleByKey.get(u.role);
    if (!roleId) continue;
    const existing = await prisma.userRole.findUnique({
      where: { userId_roleId: { userId: u.id, roleId } },
    });
    if (!existing) {
      await prisma.userRole.create({
        data: { userId: u.id, roleId },
      });
      migrated++;
    }
  }
  if (migrated) console.log(`  ✅ تم ترحيل ${migrated} مستخدم لجدول UserRole`);

  console.log("✅ تمت المزامنة بنجاح\n");
}

// Standalone execution
if (require.main === module) {
  seedPermissions()
    .catch((e) => {
      console.error("❌ خطأ في مزامنة الصلاحيات:", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
