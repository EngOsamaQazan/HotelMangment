"use client";

import { NATIONALITIES_BY_GROUP } from "@/lib/countries";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/SearchableSelect";

export interface CountrySelectProps {
  /** Arabic adjective value, e.g. "أردني". Empty string for "no selection". */
  value: string;
  /** Called with the chosen Arabic adjective (or "" when the user clears it). */
  onValueChange: (next: string) => void;
  /** Placeholder option label. Defaults to "اختر الجنسية". */
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  id?: string;
}

/**
 * Searchable nationality picker. Values are Arabic adjectives (نسبة) — e.g.
 * "سعودي" — so the component still integrates directly with OCR output (see
 * `src/app/api/ocr/route.ts`).
 *
 * Groups are ordered: GCC → Middle East → Türkiye → Iran → Asia → rest.
 *
 * If an externally-set `value` is unknown (e.g. OCR returned a spelling we
 * don't have in the list), we render it as a temporary selected option so the
 * form doesn't silently drop it.
 */
export function CountrySelect({
  value,
  onValueChange,
  placeholder = "اختر الجنسية",
  className,
  required,
  disabled,
  name,
  id,
}: CountrySelectProps) {
  const options: SearchableSelectOption[] = [];
  let isKnown = !value;

  for (const [group, list] of NATIONALITIES_BY_GROUP.entries()) {
    for (const c of list) {
      if (c.value === value) isKnown = true;
      options.push({
        value: c.value,
        label: `${c.value} — ${c.en}`,
        group,
        searchText: `${c.value} ${c.en} ${c.code}`,
      });
    }
  }

  // Preserve unknown OCR-supplied values so the form doesn't drop them silently.
  if (!isKnown && value) {
    options.unshift({ value, label: value, group: "—" });
  }

  return (
    <SearchableSelect
      value={value}
      onValueChange={onValueChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="بحث عن الجنسية..."
      className={className}
      required={required}
      disabled={disabled}
      name={name}
      id={id}
      clearable={!required}
    />
  );
}

export default CountrySelect;
