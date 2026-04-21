"use client";

import {
  forwardRef,
  useState,
  type FocusEvent,
  type InputHTMLAttributes,
} from "react";

type ForwardedProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onBlur" | "type" | "min" | "max" | "step" | "inputMode"
>;

export interface NumberInputProps extends ForwardedProps {
  /** Current numeric value (always a clamped, valid number). */
  value: number;
  /** Called with the next clamped numeric value. */
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  /**
   * Whether to allow decimals. When false (default) the input is integer-only,
   * uses `parseInt`, and shows the numeric keypad on mobile.
   */
  decimal?: boolean;
  /** Value to fall back to when user blurs an empty/invalid input. Defaults to `min ?? 0`. */
  fallback?: number;
  /** Called on blur after the value has been normalized (optional). */
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  /** Override the inputMode attribute if needed. */
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}

/**
 * Controlled numeric input that allows the user to temporarily clear the field
 * (e.g. Backspace on mobile) without snapping back to the fallback value mid-edit.
 *
 * Behaviour:
 *   • onChange: the raw string is updated locally; if it parses to a valid number,
 *     we clamp it against `min`/`max` and forward it via `onValueChange`.
 *   • onBlur:   the raw string is normalized to the effective numeric value
 *     (or `fallback` if the field was left empty / invalid).
 *
 * External updates to `value` while the input is *not* focused are mirrored
 * into the display. While focused we leave the user's typing untouched.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      value,
      onValueChange,
      min,
      max,
      step,
      decimal = false,
      fallback,
      onBlur,
      onFocus,
      inputMode,
      ...rest
    },
    ref,
  ) {
    // `draft` holds the user's in-progress text while the field is focused
    // (including empty strings, partial "-" or "1."). When null, we fall back
    // to the controlled `value` stringified — so external updates show up
    // without needing a useEffect to sync derived state.
    const [draft, setDraft] = useState<string | null>(null);
    const raw = draft ?? (Number.isFinite(value) ? String(value) : "");

    function clamp(n: number): number {
      let v = n;
      if (typeof min === "number") v = Math.max(min, v);
      if (typeof max === "number") v = Math.min(max, v);
      return v;
    }

    function resolveFallback(): number {
      if (typeof fallback === "number") return fallback;
      if (typeof min === "number") return min;
      return 0;
    }

    return (
      <input
        ref={ref}
        type="number"
        inputMode={inputMode ?? (decimal ? "decimal" : "numeric")}
        min={min}
        max={max}
        step={step}
        value={raw}
        onFocus={(e) => {
          if (draft === null) setDraft(raw);
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (next === "" || next === "-" || next === ".") return;
          const parsed = decimal ? parseFloat(next) : parseInt(next, 10);
          if (Number.isFinite(parsed)) {
            const clamped = clamp(parsed);
            if (clamped !== value) onValueChange(clamped);
          }
        }}
        onBlur={(e) => {
          const parsed = decimal ? parseFloat(raw) : parseInt(raw, 10);
          if (Number.isFinite(parsed)) {
            const clamped = clamp(parsed);
            if (clamped !== value) onValueChange(clamped);
          } else {
            const fb = resolveFallback();
            if (fb !== value) onValueChange(fb);
          }
          // Release our local draft so the field reflects the (now normalized)
          // controlled value on the next render.
          setDraft(null);
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
