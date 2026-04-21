"use client";

import type { ReactNode } from "react";
import { usePermissions } from "@/lib/permissions/client";
import { ForbiddenCard } from "@/components/ForbiddenCard";

interface PermissionGateProps {
  /** A single permission key or an array — user needs ANY one by default. */
  permission: string | string[];
  /** Require ALL listed permissions instead of ANY. */
  all?: boolean;
  /** Content rendered when the permission check passes. */
  children: ReactNode;
  /** Optional custom fallback; defaults to the shared ForbiddenCard. */
  fallback?: ReactNode;
  /** Props forwarded to the default `ForbiddenCard`. */
  forbiddenTitle?: string;
  forbiddenDescription?: ReactNode;
  forbiddenBackHref?: string;
  forbiddenBackLabel?: string;
}

/**
 * Hard client-side page gate: renders children only if the user has the
 * required permission. While the permissions context is still loading
 * nothing is rendered (so we don't flash the forbidden card during the
 * initial hydration tick).
 */
export function PermissionGate({
  permission,
  all = false,
  children,
  fallback,
  forbiddenTitle,
  forbiddenDescription,
  forbiddenBackHref,
  forbiddenBackLabel,
}: PermissionGateProps) {
  const { can, canAll, isLoading } = usePermissions();
  const keys = Array.isArray(permission) ? permission : [permission];
  const ok = all ? canAll(keys) : can(keys);

  if (isLoading) return null;
  if (ok) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <ForbiddenCard
      title={forbiddenTitle}
      description={forbiddenDescription}
      backHref={forbiddenBackHref}
      backLabel={forbiddenBackLabel}
    />
  );
}
