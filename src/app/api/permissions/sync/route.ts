import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  invalidatePermissionsCache,
} from "@/lib/permissions/guard";
import { syncPermissionsFromRegistry } from "@/lib/permissions/sync";

/**
 * POST /api/permissions/sync
 *
 * Pushes the in-code permissions registry into the database so the roles
 * matrix / user overrides UI reflects the latest modules. Equivalent to
 * running `npm run db:seed-permissions` on the server, but callable from
 * the admin UI so deployments don't need shell access.
 *
 * Guarded by either `settings.roles:sync` (granular) or `settings.roles:edit`
 * (fallback). The fallback is important: on the very first deploy that adds
 * this endpoint, the DB does not yet know about the `:sync` action — any
 * existing admin wouldn't be able to trigger the sync that creates it. The
 * `:edit` grant lets them bootstrap out of that chicken-and-egg.
 */
export async function POST() {
  try {
    await requirePermission("settings.roles:sync", "settings.roles:edit");

    const result = await syncPermissionsFromRegistry(prisma, {
      migrateLegacyUserRoles: true,
      log: false,
    });

    // System roles may have had their permission set rebuilt, so the
    // server-side per-user permission cache is now stale. Clear it so the
    // next request re-reads from DB and everyone sees the new grants.
    invalidatePermissionsCache();

    return NextResponse.json({
      ok: true,
      message: "تمت مزامنة الصلاحيات من الكود بنجاح",
      ...result,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/permissions/sync error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "فشل مزامنة الصلاحيات — راجع سجلات الخادم",
      },
      { status: 500 },
    );
  }
}
