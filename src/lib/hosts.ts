/**
 * Admin ↔ Public subdomain split.
 *
 * The hotel app serves two audiences from a single Next.js process:
 *
 *   • `admin.mafhotel.com`  → staff dashboard (admin UI + admin APIs)
 *   • `mafhotel.com`        → guest-facing site (landing, booking, /account)
 *
 * Host separation is enforced by `src/middleware.ts` using the helpers below.
 * When `ADMIN_HOST` is not configured (typical in local development with
 * `localhost:3000`) the split is disabled and the middleware falls back to the
 * audience-based logic only — so a single `npm run dev` still serves both.
 */
const DEFAULT_ADMIN_HOST = "admin.mafhotel.com";
const DEFAULT_PUBLIC_HOST = "mafhotel.com";

function clean(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

function stripPort(host: string): string {
  const idx = host.indexOf(":");
  return idx === -1 ? host : host.slice(0, idx);
}

function envAdminHost(): string {
  return clean(process.env.ADMIN_HOST) || "";
}

function envPublicHost(): string {
  return clean(process.env.PUBLIC_HOST) || "";
}

/**
 * Whether the admin/public host split is enabled. Only enforced when
 * `ADMIN_HOST` is set — otherwise dev (`localhost`) keeps its single-host
 * behaviour.
 */
export function isHostSplitEnabled(): boolean {
  return envAdminHost().length > 0;
}

/** Host (no scheme, no port) used to serve the admin/staff dashboard. */
export function getAdminHost(): string {
  return envAdminHost() || DEFAULT_ADMIN_HOST;
}

/** Host (no scheme, no port) used to serve the public/guest site. */
export function getPublicHost(): string {
  return envPublicHost() || DEFAULT_PUBLIC_HOST;
}

/**
 * Extra hostnames that should also be treated as "public" (e.g. the `www.`
 * variant). Configure via `PUBLIC_HOST_ALIASES` as a comma-separated list.
 */
export function getPublicHostAliases(): string[] {
  const raw = process.env.PUBLIC_HOST_ALIASES ?? "";
  const fromEnv = raw
    .split(",")
    .map((h) => clean(h))
    .filter(Boolean);
  const publicHost = envPublicHost() || DEFAULT_PUBLIC_HOST;
  // Always treat `www.<publicHost>` as a public alias.
  return Array.from(new Set([...fromEnv, `www.${publicHost}`]));
}

export type HostKind = "admin" | "public" | "other";

/**
 * Classify a raw `Host` header (may include port) into one of the three
 * buckets. `other` covers dev hosts like `localhost` and unknown domains; the
 * middleware treats them as unrestricted.
 */
export function classifyHost(rawHost: string | null | undefined): HostKind {
  if (!isHostSplitEnabled()) return "other";
  const host = stripPort(clean(rawHost ?? ""));
  if (!host) return "other";
  if (host === getAdminHost()) return "admin";
  if (host === getPublicHost()) return "public";
  if (getPublicHostAliases().includes(host)) return "public";
  return "other";
}
