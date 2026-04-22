"use client";

/**
 * Client-side permissions provider + hook.
 *
 * Usage:
 *   // In the root layout:
 *   <PermissionsProvider>...</PermissionsProvider>
 *
 *   // In any component:
 *   const { can, isLoading } = usePermissions();
 *   if (!can("reservations:create")) return null;
 *
 *   // Or declaratively:
 *   <Can permission="reservations:create"><button>+</button></Can>
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";

export interface RoleSummary {
  id: number;
  key: string;
  name: string;
  isSystem: boolean;
}

export interface MeResponse {
  user: {
    id: number;
    name: string;
    email: string;
    legacyRole: string | null;
    roles: RoleSummary[];
  } | null;
  permissions: string[];
}

interface PermissionsContextValue {
  permissions: Set<string>;
  roles: RoleSummary[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  can: (permission: string | string[]) => boolean;
  canAll: (permissions: string[]) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [hasFetched, setHasFetched] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/me/permissions", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          setPermissions(new Set());
          setRoles([]);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json: MeResponse = await res.json();
      setPermissions(new Set(json.permissions));
      setRoles(json.user?.roles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الصلاحيات");
    } finally {
      setIsFetching(false);
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchPermissions();
    } else if (status === "unauthenticated") {
      setPermissions(new Set());
      setRoles([]);
      setHasFetched(true);
    }
  }, [status, fetchPermissions]);

  // Treat session "loading", authenticated-but-not-yet-fetched, and any
  // in-flight refetch as "loading" so consumers never see a false "denied"
  // state during the initial hydration window (which previously caused the
  // forbidden card to flash before permissions arrived).
  const isLoading =
    status === "loading" ||
    (status === "authenticated" && !hasFetched) ||
    isFetching;

  const can = useCallback(
    (permission: string | string[]): boolean => {
      if (!permission) return true;
      const keys = Array.isArray(permission) ? permission : [permission];
      if (keys.length === 0) return true;
      return keys.some((k) => permissions.has(k));
    },
    [permissions],
  );

  const canAll = useCallback(
    (keys: string[]): boolean => keys.every((k) => permissions.has(k)),
    [permissions],
  );

  const value = useMemo<PermissionsContextValue>(
    () => ({
      permissions,
      roles,
      isLoading,
      error,
      refetch: fetchPermissions,
      can,
      canAll,
    }),
    [permissions, roles, isLoading, error, fetchPermissions, can, canAll],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx)
    throw new Error("usePermissions must be used inside <PermissionsProvider>");
  return ctx;
}

/** Convenience boolean hook. */
export function useHasPermission(permission: string | string[]): boolean {
  const { can } = usePermissions();
  return can(permission);
}
