/**
 * Server-side permission guard.
 *
 * Usage inside a Next.js Route Handler:
 *
 *   import { requirePermission } from "@/lib/permissions/guard";
 *   export async function GET() {
 *     await requirePermission("reservations:view");
 *     // ...
 *   }
 */

import "server-only";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RESOURCES, ACTION_LABELS } from "@/lib/permissions/registry";

/** HTTP error that Route Handlers can throw/return to the client. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "غير مصرّح — يجب تسجيل الدخول أولاً") {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "ممنوع — ليس لديك الصلاحية المطلوبة") {
    super(403, message);
  }
}

/**
 * Convert a permission key like `dashboard:view` into a human-readable
 * Arabic label such as "لوحة التحكم — عرض" using the permissions registry.
 * Falls back to the raw key if we can't resolve it.
 */
function formatPermissionKeyAr(key: string): string {
  const [resourceKey, action] = key.split(":");
  const resource = RESOURCES.find((r) => r.key === resourceKey);
  const resourceLabel = resource?.label ?? resourceKey;

  let actionLabel: string | undefined = ACTION_LABELS[action];
  if (!actionLabel && resource?.extraActions) {
    actionLabel = resource.extraActions.find((x) => x.key === action)?.label;
  }

  if (!actionLabel) return `${resourceLabel} (${action})`;
  return `${resourceLabel} — ${actionLabel}`;
}

// ───────────── In-memory permission cache ─────────────

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<number, CacheEntry>();

/** Invalidate cached permissions for a user (call after role/override changes). */
export function invalidatePermissionsCache(userId?: number) {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}

// ───────────── Core lookups ─────────────

/**
 * Compute the effective set of permission keys for a user by combining:
 *   (role permissions via UserRole) ∪ (allow overrides) − (deny overrides)
 *
 * If the user has no UserRole entries yet (legacy), falls back to
 * looking up a Role whose `key` matches the legacy `User.role` string.
 */
export async function getUserPermissions(
  userId: number,
): Promise<Set<string>> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.permissions;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      userRoles: {
        where: { role: { isActive: true } },
        select: {
          role: {
            select: {
              key: true,
              permissions: {
                where: { permission: { isActive: true } },
                select: {
                  permission: { select: { key: true } },
                },
              },
            },
          },
        },
      },
      permissionOverrides: {
        where: { permission: { isActive: true } },
        select: {
          effect: true,
          permission: { select: { key: true } },
        },
      },
    },
  });

  if (!user) {
    cache.set(userId, { permissions: new Set(), expiresAt: Date.now() + 1000 });
    return new Set();
  }

  const allowed = new Set<string>();

  // Role-based grants.
  let hasAnyRole = user.userRoles.length > 0;
  for (const ur of user.userRoles) {
    for (const rp of ur.role.permissions) {
      allowed.add(rp.permission.key);
    }
  }

  // Legacy fallback: if no UserRole rows yet, use the string `role` column.
  if (!hasAnyRole && user.role) {
    const role = await prisma.role.findUnique({
      where: { key: user.role },
      select: {
        permissions: {
          where: { permission: { isActive: true } },
          select: { permission: { select: { key: true } } },
        },
      },
    });
    if (role) {
      for (const rp of role.permissions) allowed.add(rp.permission.key);
      hasAnyRole = true;
    }
  }

  // Apply overrides.
  for (const o of user.permissionOverrides) {
    if (o.effect === "allow") allowed.add(o.permission.key);
    else if (o.effect === "deny") allowed.delete(o.permission.key);
  }

  cache.set(userId, {
    permissions: allowed,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return allowed;
}

// ───────────── Public API ─────────────

export async function getSessionOrThrow(): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();
  return session;
}

export async function hasPermission(
  userId: number,
  ...keys: string[]
): Promise<boolean> {
  if (!keys.length) return true;
  const perms = await getUserPermissions(userId);
  return keys.some((k) => perms.has(k));
}

/**
 * Throws `UnauthorizedError` if no session, or `ForbiddenError` if missing.
 * Returns the authenticated session on success.
 *
 * Accepts one or more keys — user only needs ONE of them (OR semantics).
 */
export async function requirePermission(
  ...keys: string[]
): Promise<Session> {
  const session = await getSessionOrThrow();
  const userId = Number((session.user as { id?: string | number }).id);
  if (!Number.isFinite(userId)) throw new UnauthorizedError();
  if (!keys.length) return session;

  const ok = await hasPermission(userId, ...keys);
  if (!ok) {
    const labels = keys.map(formatPermissionKeyAr).join("، ");
    const msg =
      keys.length === 1
        ? `ممنوع — تتطلب هذه الصفحة صلاحية: ${labels}`
        : `ممنوع — تتطلب هذه الصفحة إحدى الصلاحيات التالية: ${labels}`;
    throw new ForbiddenError(msg);
  }
  return session;
}

/**
 * Convenience wrapper for Route Handlers that converts `HttpError` into a
 * proper JSON `Response`. Example:
 *
 *   export const GET = withPermission("reservations:view", async () => {...});
 */
export function withPermission<Args extends unknown[]>(
  keyOrKeys: string | string[],
  handler: (session: Session, ...args: Args) => Promise<Response> | Response,
) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  return async (...args: Args): Promise<Response> => {
    try {
      const session = await requirePermission(...keys);
      return await handler(session, ...args);
    } catch (e) {
      if (e instanceof HttpError) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: e.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw e;
    }
  };
}

/**
 * Helper to turn unexpected errors in a Route Handler into clean 401/403
 * responses. Wrap the body with `try { ... } catch (e) { return handleAuthError(e) }`
 * or prefer `withPermission()` above.
 */
export function handleAuthError(e: unknown): Response | null {
  if (e instanceof HttpError) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
