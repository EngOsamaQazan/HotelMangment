"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { findResourceByRoute, permissionKey } from "@/lib/permissions/registry";
import { PermissionGate } from "@/components/PermissionGate";

/** Paths that must never be gated (auth flow, root redirects, etc.). */
const BYPASS_PATHS = new Set<string>(["/login"]);

/**
 * Mounted once in the root layout. Looks up the resource that owns the
 * current pathname via `findResourceByRoute` and gates the page against
 * `<resource>:view`. If no resource owns the route, the page passes through
 * untouched — so pages that intentionally live outside the permissions
 * registry (e.g. `/login`) keep working.
 */
export function RoutePermissionGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (BYPASS_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  const resource = findResourceByRoute(pathname);
  if (!resource || !resource.actions.includes("view")) {
    return <>{children}</>;
  }

  return (
    <PermissionGate
      permission={permissionKey(resource.key, "view")}
      forbiddenTitle={`لا تملك صلاحية عرض: ${resource.label}`}
      forbiddenDescription={
        <>
          تم حجب هذا القسم عنك لأنك لا تملك صلاحية «{resource.label} — عرض».
          راجع مدير النظام لمنحك الصلاحية أو عُد إلى الصفحة الرئيسية.
        </>
      }
    >
      {children}
    </PermissionGate>
  );
}
