"use client";

import { forwardRef, useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { NATIONALITIES_BY_GROUP } from "@/lib/countries";
import { dialCodeFor } from "@/lib/dial-codes";

export interface PhoneInputProps {
  /** Local/national part of the phone number (digits only, no dial code). */
  value: string;
  onValueChange: (next: string) => void;
  /** "+XXX" dial code. Chosen from the dropdown, editable by the user. */
  dialCode: string;
  onDialCodeChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface DialOption {
  /** Dial code, e.g. "+962". */
  dial: string;
  /** ISO 3166-1 alpha-2 code, used as a tiebreaker for the <option> key. */
  iso: string;
  /** Arabic country/adjective label used in the dropdown row. */
  label: string;
}

/**
 * Build a de-duplicated, region-grouped list of dial-code options from the
 * same source of truth as `CountrySelect`. Several countries share a dial
 * code (e.g. US/Canada = +1); we keep the first occurrence per region so
 * the dropdown stays short and regionally sorted.
 */
function useGroupedDialOptions(): ReadonlyMap<string, DialOption[]> {
  return useMemo(() => {
    const map = new Map<string, DialOption[]>();
    for (const [group, list] of NATIONALITIES_BY_GROUP.entries()) {
      const seen = new Set<string>();
      const bucket: DialOption[] = [];
      for (const c of list) {
        const dial = dialCodeFor(c.code);
        if (!dial) continue;
        if (seen.has(dial)) continue;
        seen.add(dial);
        bucket.push({ dial, iso: c.code, label: c.value });
      }
      if (bucket.length > 0) map.set(group, bucket);
    }
    return map;
  }, []);
}

/**
 * Phone field = dial-code <select> + local number <input>, inside a single
 * rounded/focusable shell that matches the rest of the form.
 *
 * The two values are kept separate (dial + local) so the parent form can:
 *   - auto-fill the dial code when the guest's nationality is chosen/scanned,
 *   - still allow the clerk to override it (e.g. a Saudi national using a
 *     Jordanian SIM) straight from the dropdown.
 *
 * If an externally-provided `dialCode` is not in our list (unlikely, but
 * possible for territories we haven't catalogued), we render it as a
 * temporary selected option so the form never silently drops it.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput(
    {
      value,
      onValueChange,
      dialCode,
      onDialCodeChange,
      placeholder = "07XXXXXXXX",
      className,
      disabled,
    },
    ref,
  ) {
    const id = useId();
    const grouped = useGroupedDialOptions();

    const isKnown = useMemo(() => {
      if (!dialCode) return true;
      for (const list of grouped.values()) {
        if (list.some((o) => o.dial === dialCode)) return true;
      }
      return false;
    }, [dialCode, grouped]);

    return (
      <div
        dir="ltr"
        className={cn(
          "flex items-stretch rounded-lg border border-gray-200 bg-white overflow-hidden",
          "focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary",
          disabled && "opacity-60 cursor-not-allowed",
          className,
        )}
      >
        <select
          id={`${id}-dial`}
          value={dialCode}
          onChange={(e) => onDialCodeChange(e.target.value)}
          disabled={disabled}
          aria-label="رمز الدولة"
          className="w-24 shrink-0 px-2 py-2.5 text-sm text-gray-700 bg-gray-50 border-l border-gray-200 focus:outline-none text-center tracking-tight appearance-none cursor-pointer"
        >
          <option value="">+</option>
          {!isKnown && dialCode && (
            <option value={dialCode}>{dialCode}</option>
          )}
          {Array.from(grouped.entries()).map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((o) => (
                <option key={`${o.iso}-${o.dial}`} value={o.dial}>
                  {o.dial} — {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <input
          id={`${id}-num`}
          ref={ref}
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 px-3 py-2.5 text-sm focus:outline-none"
        />
      </div>
    );
  },
);
