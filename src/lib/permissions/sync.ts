/**
 * Permissions Sync — Shared Core
 * =========================================================================
 * Pushes the contents of the `RESOURCES` registry + `DEFAULT_ROLES` presets
 * into the database. Used by:
 *
 *   • The CLI seed script (`prisma/seed-permissions.ts`)
 *   • The admin API route `POST /api/permissions/sync` (triggered by the
 *     "تحديث الصلاحيات" button in the roles page)
 *
 * The operation is fully idempotent and safe to re-run any time:
 *   - Upserts every Resource + Permission found in the code registry.
 *   - Marks permissions that no longer exist in code as `isActive=false`
 *     (we never hard-delete so audit/override history stays intact).
 *   - Rebuilds the permission set of *system* roles from `DEFAULT_ROLES`.
 *     Custom roles are left untouched (only missing preset grants are added).
 */
import type { PrismaClient } from "@prisma/client";
import {
  RESOURCES,
  DEFAULT_ROLES,
  ACTION_LABELS,
  expandPermissions,
  permissionKey,
} from "./registry";

export interface SyncPermissionsResult {
  resourcesUpserted: number;
  permissionsUpserted: number;
  permissionsDeactivated: number;
  rolesTouched: number;
  usersMigrated: number;
}

/**
 * Sync DB with the in-code registry. The caller supplies a PrismaClient so
 * this same function works inside Next.js API routes (shared `prisma`) as
 * well as one-shot CLI scripts that create their own client.
 */
export async function syncPermissionsFromRegistry(
  prisma: PrismaClient,
  opts: { migrateLegacyUserRoles?: boolean; log?: boolean } = {},
): Promise<SyncPermissionsResult> {
  const { migrateLegacyUserRoles = true, log = false } = opts;
  const note = (msg: string) => {
    if (log) console.log(msg);
  };

  note("🔐 مزامنة الصلاحيات من الـ registry...");

  const seenPermissionKeys = new Set<string>();
  let resourcesUpserted = 0;
  let permissionsUpserted = 0;

  // ───────────── Resources + Permissions ─────────────
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
    resourcesUpserted++;

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
      permissionsUpserted++;
    }
  }

  // Deactivate (soft-delete) permissions that vanished from the registry.
  const deactivated = await prisma.permission.updateMany({
    where: { key: { notIn: Array.from(seenPermissionKeys) }, isActive: true },
    data: { isActive: false },
  });
  if (deactivated.count > 0) {
    note(`  ⚠️  تم تعطيل ${deactivated.count} صلاحية غير موجودة بالكود`);
  }

  note(
    `  ✅ ${RESOURCES.length} resources + ${seenPermissionKeys.size} permissions`,
  );

  // ───────────── Default Roles ─────────────
  let rolesTouched = 0;
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

    // System presets are re-asserted on every sync. Custom roles are not
    // touched here — admins curate those manually from the UI.
    if (preset.isSystem) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (perms.length) {
        await prisma.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
    } else {
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
    rolesTouched++;
    note(`  ✅ Role ${preset.key}: ${perms.length} perms`);
  }

  // ───────────── Migrate legacy User.role → UserRole ─────────────
  let usersMigrated = 0;
  if (migrateLegacyUserRoles) {
    const users = await prisma.user.findMany({
      select: { id: true, role: true },
    });
    const roleByKey = new Map(
      (await prisma.role.findMany({ select: { id: true, key: true } })).map(
        (r) => [r.key, r.id],
      ),
    );
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
        usersMigrated++;
      }
    }
    if (usersMigrated) {
      note(`  ✅ تم ترحيل ${usersMigrated} مستخدم لجدول UserRole`);
    }
  }

  note("✅ تمت المزامنة بنجاح\n");

  return {
    resourcesUpserted,
    permissionsUpserted,
    permissionsDeactivated: deactivated.count,
    rolesTouched,
    usersMigrated,
  };
}
