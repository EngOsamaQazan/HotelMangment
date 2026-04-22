/**
 * Normalize an arbitrary phone string to the digits-only E.164 form used by
 * the WhatsApp Cloud API (e.g. "962781099910" — no leading "+" or spaces).
 *
 * Accepts local Jordanian numbers ("07..." / "78..." / "7..."), already-
 * international numbers ("+962...", "00962..."), and messy user input. If
 * we cannot confidently produce a valid number we return null so the caller
 * can surface a clean validation error.
 */
const DEFAULT_COUNTRY_CODE = "962"; // Jordan — the hotel's home country.

export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Convert Arabic-Indic / extended digits to ASCII.
  s = s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

  // Keep only digits and a leading "+".
  const hasPlus = s.trimStart().startsWith("+");
  s = s.replace(/[^0-9]/g, "");
  if (!s) return null;

  // Already international (with + or 00 prefix).
  if (hasPlus) {
    // nothing more to do
  } else if (s.startsWith("00")) {
    s = s.slice(2);
  } else if (s.startsWith("0")) {
    // Local format (e.g. 0781099910) → prepend default country code.
    s = DEFAULT_COUNTRY_CODE + s.slice(1);
  } else if (s.length <= 9) {
    // Bare mobile (e.g. 781099910) → prepend default country code.
    s = DEFAULT_COUNTRY_CODE + s;
  }

  // Sanity: WhatsApp requires 8–15 digits.
  if (s.length < 8 || s.length > 15) return null;
  return s;
}

export function displayPhone(raw: string | null | undefined): string {
  const n = normalizeWhatsAppPhone(raw);
  return n ? `+${n}` : (raw ?? "");
}
