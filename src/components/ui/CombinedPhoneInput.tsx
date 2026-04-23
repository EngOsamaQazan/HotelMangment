"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { NATIONALITIES_BY_GROUP } from "@/lib/countries";
import { dialCodeFor } from "@/lib/dial-codes";

/**
 * Adapter around `PhoneInput` for forms that don't want to split their state
 * into dial-code + local-number. It accepts a single `value` string — anything
 * from a pasted E.164 ("+962781099910"), an international-no-plus
 * ("962781099910"), or a local Jordanian number ("0781099910") — and emits
 * back a combined "+<dial><local>" string whenever either half changes.
 *
 * Same look-and-feel as the split `PhoneInput` used in /reservations/new.
 */
interface CombinedPhoneInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Used when `value` has no recognisable dial code. Defaults to +962. */
  defaultDialCode?: string;
}

/** Our catalogue's longest dial code is +1684 (American Samoa) at 4 digits. */
const KNOWN_DIAL_LENGTHS = [4, 3, 2, 1];

/**
 * Best-effort split of a combined string into "+<dial>" + "<local digits>".
 * Prefers the longest match from a curated dial-code list; if nothing
 * matches we assume the caller's default country code.
 */
function splitCombined(
  combined: string,
  fallbackDial: string,
  knownDials: ReadonlySet<string>,
): { dial: string; local: string } {
  const raw = String(combined ?? "").trim();
  if (!raw) return { dial: fallbackDial, local: "" };

  let s = raw.replace(/[^0-9+]/g, "");
  // 00-prefixed international → + prefix
  if (s.startsWith("00")) s = "+" + s.slice(2);

  // Local format like "0781099910" → strip the trunk 0 and prepend fallback.
  if (s.startsWith("0") && !s.startsWith("00")) {
    return { dial: fallbackDial, local: s.slice(1) };
  }

  if (s.startsWith("+")) {
    const digits = s.slice(1);
    for (const len of KNOWN_DIAL_LENGTHS) {
      const candidate = "+" + digits.slice(0, len);
      if (knownDials.has(candidate)) {
        return { dial: candidate, local: digits.slice(len) };
      }
    }
    // Unknown dial code — keep first 2 digits as the dial so the UI still
    // renders something and the user can fix it in the dropdown.
    return { dial: "+" + digits.slice(0, 2), local: digits.slice(2) };
  }

  // Bare digits that look like an international number with no plus.
  const digits = s;
  for (const len of KNOWN_DIAL_LENGTHS) {
    const candidate = "+" + digits.slice(0, len);
    if (knownDials.has(candidate)) {
      return { dial: candidate, local: digits.slice(len) };
    }
  }
  // Likely a bare local mobile — prepend fallback dial.
  return { dial: fallbackDial, local: digits };
}

/**
 * Grab the dial codes from NATIONALITIES_BY_GROUP so splitCombined can
 * do prefix matching. Defined lazily so the heavy nationality table
 * isn't loaded unless this component actually renders.
 */
function useKnownDialCodes(): ReadonlySet<string> {
  return useMemo(() => {
    const set = new Set<string>();
    for (const list of NATIONALITIES_BY_GROUP.values()) {
      for (const c of list) {
        const dial = dialCodeFor(c.code);
        if (dial) set.add(dial);
      }
    }
    return set;
  }, []);
}

export function CombinedPhoneInput({
  value,
  onChange,
  placeholder = "07XXXXXXXX",
  className,
  disabled,
  defaultDialCode = "+962",
}: CombinedPhoneInputProps) {
  const known = useKnownDialCodes();
  const initial = useMemo(
    () => splitCombined(value, defaultDialCode, known),
    // Only split once on first render; afterwards the two halves are the
    // source of truth and the parent's `value` is a derived mirror.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [dial, setDial] = useState(initial.dial);
  const [local, setLocal] = useState(initial.local);

  // If the parent replaces `value` with something we didn't write (eg. the
  // parent re-opens the form with a new contact's number), resync both
  // halves. We compare against our own last-emitted combined to avoid a
  // render-loop.
  const lastEmitted = useRef<string>(
    `${initial.dial}${initial.local}`.replace(/[^0-9+]/g, ""),
  );
  useEffect(() => {
    const normalized = String(value ?? "").replace(/[^0-9+]/g, "");
    if (normalized === lastEmitted.current) return;
    const next = splitCombined(value, defaultDialCode, known);
    setDial(next.dial);
    setLocal(next.local);
    lastEmitted.current = `${next.dial}${next.local}`.replace(/[^0-9+]/g, "");
  }, [value, defaultDialCode, known]);

  function emit(d: string, l: string) {
    const digits = l.replace(/[^0-9]/g, "");
    const combined = d && digits ? `${d}${digits}` : `${d}${digits}`;
    lastEmitted.current = combined.replace(/[^0-9+]/g, "");
    onChange(combined);
  }

  return (
    <PhoneInput
      value={local}
      onValueChange={(next) => {
        const digits = next.replace(/[^0-9]/g, "");
        setLocal(digits);
        emit(dial, digits);
      }}
      dialCode={dial}
      onDialCodeChange={(next) => {
        setDial(next);
        emit(next, local);
      }}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
}
