"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { NATIONALITIES_BY_GROUP } from "@/lib/countries";

type ForwardedProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange" | "multiple"
>;

export interface CountrySelectProps extends ForwardedProps {
  /** Arabic adjective value, e.g. "أردني". Empty string for "no selection". */
  value: string;
  /** Called with the chosen Arabic adjective (or "" when the user clears it). */
  onValueChange: (next: string) => void;
  /** Placeholder option label. Defaults to "اختر الجنسية". */
  placeholder?: string;
}

/**
 * Native <select> with all world nationalities grouped into <optgroup>.
 * Groups are ordered: GCC → Middle East → Türkiye → Iran → Asia → rest.
 *
 * Values are Arabic adjectives (نسبة) — e.g. "سعودي" — so the component
 * integrates directly with OCR output (see `src/app/api/ocr/route.ts`).
 *
 * If an externally-set `value` is unknown (e.g. OCR returned a spelling we
 * don't have in the list), we render it as a temporary selected option so
 * the form doesn't silently drop it.
 */
export const CountrySelect = forwardRef<HTMLSelectElement, CountrySelectProps>(
  function CountrySelect(
    { value, onValueChange, placeholder = "اختر الجنسية", className, ...rest },
    ref,
  ) {
    const isKnown = (() => {
      if (!value) return true;
      for (const list of NATIONALITIES_BY_GROUP.values()) {
        if (list.some((c) => c.value === value)) return true;
      }
      return false;
    })();

    return (
      <select
        ref={ref}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={className}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {!isKnown && value && (
          <option value={value}>{value}</option>
        )}
        {Array.from(NATIONALITIES_BY_GROUP.entries()).map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map((c) => (
              <option key={c.code} value={c.value}>
                {c.value} — {c.en}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  },
);
