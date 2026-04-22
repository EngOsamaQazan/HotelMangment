/**
 * Helpers to translate stored photo references (either local "stored:<path>"
 * or raw external URLs) into URLs the guest-facing pages can render.
 *
 * Unit-type photos and unit photos live behind the public
 * `/api/files/unit-type-photo/<id>` and `/api/files/unit-photo/<id>` endpoints
 * which serve the binary with aggressive caching and no auth requirement.
 */

export type PublicPhotoKind = "unit-photo" | "unit-type-photo";

export function publicPhotoUrl(
  kind: PublicPhotoKind,
  photoId: number | null | undefined,
  rawUrl?: string | null,
): string | null {
  if (rawUrl && /^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (photoId && Number.isFinite(photoId)) {
    return `/api/files/${kind}/${photoId}`;
  }
  return null;
}
