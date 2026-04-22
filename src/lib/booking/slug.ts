/**
 * Helpers for SEO-friendly unit-type URLs.
 *
 * We embed the numeric id at the tail of a descriptive slug so:
 *   • `/book/type/deluxe-suite-12` is human-readable and shareable;
 *   • the id is trivially recoverable (no extra DB lookup);
 *   • changing the display name never breaks old URLs.
 *
 * The canonical shape is:  `<kebab-case-label>-<id>`
 * where the label is derived from the English name (falling back to the
 * admin code) and stripped to ASCII letters/digits/dashes.
 */

const NON_URL_SAFE = /[^a-zA-Z0-9]+/g;

/** Lowercases a label and collapses any non-[a-z0-9] run to a single dash. */
function kebabify(input: string): string {
  return (input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(NON_URL_SAFE, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/**
 * Build the canonical slug for a unit type.
 *
 * Prefers the English name — it's what Google indexes and what users
 * see in the address bar when they share the page. If the English name
 * is empty / non-ASCII, falls back to the admin code.
 */
export function buildUnitTypeSlug(
  nameEn: string | null | undefined,
  code: string | null | undefined,
  id: number,
): string {
  const label =
    kebabify(nameEn ?? "") || kebabify(code ?? "") || "room";
  return `${label}-${id}`;
}

/**
 * Pull the numeric id out of a URL segment.
 *
 * Accepts all of:
 *   • `deluxe-suite-12`  → 12
 *   • `12`               → 12  (pure-numeric legacy shape)
 *   • `anything-garbage` → null
 */
export function parseIdFromSlug(slug: string): number | null {
  if (!slug) return null;
  const decoded = decodeURIComponent(slug);
  if (/^\d+$/.test(decoded)) {
    const n = Number(decoded);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m = decoded.match(/-(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * True iff `slug` already equals the canonical slug we'd emit for this
 * type. Used by the detail page to decide whether to issue a client-side
 * canonical redirect.
 */
export function isCanonicalSlug(
  slug: string,
  nameEn: string | null | undefined,
  code: string | null | undefined,
  id: number,
): boolean {
  return decodeURIComponent(slug) === buildUnitTypeSlug(nameEn, code, id);
}
