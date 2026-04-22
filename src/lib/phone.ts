/**
 * Phone number utilities — tailored to our audience (Jordanian + GCC guests
 * mostly, with occasional international callers). We canonicalize everything
 * to E.164 digits-only (no leading "+"), which is also the format expected
 * by the WhatsApp Cloud API `to` field.
 *
 * Rules:
 *  - Strip every non-digit character (spaces, dashes, parens, "+").
 *  - If the number starts with "00" (international prefix dialed in some
 *    regions) drop the two leading zeros.
 *  - If the number starts with "0" and the remainder is 9 digits (classic
 *    Jordanian mobile pattern "07xxxxxxxx") — rewrite to "962" + rest.
 *  - Validate length is 8–15 digits.
 *
 * Returns `null` on invalid input so callers can branch cleanly.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return null;

  let e164 = digits;
  if (e164.startsWith("00")) e164 = e164.slice(2);

  if (e164.startsWith("0") && e164.length === 10 && e164[1] === "7") {
    e164 = "962" + e164.slice(1);
  }

  if (e164.length < 8 || e164.length > 15) return null;
  return e164;
}

/** Pretty-print an E.164 phone for Arabic RTL display (keeps LTR digits). */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = String(e164).replace(/\D+/g, "");
  if (d.startsWith("962") && d.length === 12) {
    return `+962 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  }
  return `+${d}`;
}

/**
 * Combines a dial-code (e.g. "+962") with a local phone input (whatever the
 * guest typed) into a canonical E.164 string. Handles the common case where
 * the guest types a local Jordanian number starting with "0" even after
 * picking a dial code — in that case we drop the leading 0 before joining.
 *
 * Returns `null` if the composition does not pass `normalizePhone`'s rules.
 */
export function composePhone(
  dialCode: string,
  local: string,
): string | null {
  const dial = (dialCode || "").replace(/\D+/g, "");
  let localDigits = (local || "").replace(/\D+/g, "");
  if (!localDigits) return null;
  // Strip leading zero(s) when a dial code is already provided — the 0 is
  // national prefix notation that doesn't belong in the international form.
  if (dial && localDigits.startsWith("0")) {
    localDigits = localDigits.replace(/^0+/, "");
  }
  const combined = `${dial}${localDigits}`;
  return normalizePhone(combined);
}
