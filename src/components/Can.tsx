"use client";

import { usePermissions } from "@/lib/permissions/client";
import type { ReactNode } from "react";

interface CanProps {
  /** A single key or an array — user needs ANY one by default. */
  permission: string | string[];
  /** Require ALL listed permissions instead of ANY. */
  all?: boolean;
  /** Rendered when the user has permission. */
  children: ReactNode;
  /** Rendered when the user does NOT have permission. */
  fallback?: ReactNode;
}

/**
 * Declarative permission gate.
 *
 *   <Can permission="reservations:create">
 *     <NewReservationButton />
 *   </Can>
 *
 *   <Can permission={["reports.monthly:view", "reports.debts:view"]} fallback={<NotAllowed/>}>
 *     <ReportsLink />
 *   </Can>
 */
export function Can({ permission, all = false, children, fallback = null }: CanProps) {
  const { can, canAll } = usePermissions();
  const keys = Array.isArray(permission) ? permission : [permission];
  const ok = all ? canAll(keys) : can(keys);
  return <>{ok ? children : fallback}</>;
}
