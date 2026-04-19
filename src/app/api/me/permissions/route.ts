import { NextResponse } from "next/server";
import {
  getSessionOrThrow,
  getUserPermissions,
  handleAuthError,
} from "@/lib/permissions/guard";
import { prisma } from "@/lib/prisma";

/**
 * Returns the current user's permissions + roles.
 * Consumed by the client-side `usePermissions()` hook.
 * Intentionally NOT protected by a permission (every logged-in user can read
 * their own permissions).
 */
export async function GET() {
  try {
    const session = await getSessionOrThrow();
    const userId = Number((session.user as { id?: string | number }).id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const [perms, user] = await Promise.all([
      getUserPermissions(userId),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          userRoles: {
            where: { role: { isActive: true } },
            select: {
              role: {
                select: { id: true, key: true, name: true, isSystem: true },
              },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      user: user
        ? {
            id: user.id,
            name: user.name,
            email: user.email,
            legacyRole: user.role,
            roles: user.userRoles.map((ur) => ur.role),
          }
        : null,
      permissions: Array.from(perms).sort(),
    });
  } catch (e) {
    const err = handleAuthError(e);
    if (err) return err;
    console.error("GET /api/me/permissions error:", e);
    return NextResponse.json(
      { error: "Failed to load permissions" },
      { status: 500 },
    );
  }
}
