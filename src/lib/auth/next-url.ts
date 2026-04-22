/**
 * Resolve the `?next=…` / legacy `?callbackUrl=…` query parameter into a
 * safe internal URL to push to after sign-in / sign-up.
 *
 * Rules:
 *   • Must begin with exactly one `/` (i.e. relative to this origin).
 *   • `//foo.com` (protocol-relative) is rejected — open-redirect guard.
 *   • Anything else falls back to the provided default.
 *
 * This is intentionally a *client-safe* pure string helper: both the
 * signin and signup pages call it from React state.
 */
export function resolveNextPath(
  params: URLSearchParams | null | undefined,
  fallback = "/account",
): string {
  const raw =
    (params?.get("next") ?? params?.get("callbackUrl") ?? "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.startsWith("/\\")) return fallback;
  return raw;
}
