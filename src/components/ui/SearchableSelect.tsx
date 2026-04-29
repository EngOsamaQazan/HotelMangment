"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  /** Unique value. Empty string is reserved for "no selection" / placeholder. */
  value: string;
  /** Visible label. */
  label: string;
  /** Optional group/optgroup heading. */
  group?: string;
  /** Small hint shown after the label (e.g. account code, code/short id). */
  hint?: string;
  /** Disable picking this option. */
  disabled?: boolean;
  /** Override the text used for filtering (defaults to `label` + hint). */
  searchText?: string;
}

export interface SearchableSelectProps {
  /** Currently selected value (controlled). Use `""` for no selection. */
  value: string;
  /** Called with the chosen value. */
  onValueChange: (next: string) => void;
  /** Available options. */
  options: SearchableSelectOption[];
  /** Trigger label when nothing is selected. */
  placeholder?: string;
  /** Placeholder shown inside the search input. */
  searchPlaceholder?: string;
  /** Message shown when no option matches the search query. */
  emptyMessage?: string;
  /** Class name for the trigger element (matches existing `<select>` styling). */
  className?: string;
  /** Disable the entire control. */
  disabled?: boolean;
  /** Mark this field as required (mirrors `<select required>`). */
  required?: boolean;
  /** Form field name (used for the hidden input). */
  name?: string;
  /** DOM id for the trigger button. */
  id?: string;
  /** ARIA label when no visible label is associated. */
  "aria-label"?: string;
  /**
   * Skip rendering the search input when there are fewer than N options.
   * Defaults to `6`. Set to `0` to always show the search input.
   */
  searchThreshold?: number;
  /**
   * If true, allow clearing the selection via an inline "×" button on the trigger.
   * Defaults to `false`.
   */
  clearable?: boolean;
  /** Optional title attribute for accessibility / mouse hover. */
  title?: string;
}

const DEFAULT_TRIGGER_CLASS =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white";

interface NormalisedOption extends SearchableSelectOption {
  _searchKey: string;
}

/**
 * Strip Arabic diacritics (tashkeel) and normalise alef/yaa variants so a
 * user typing "احمد" still matches "أَحْمَد" or "إحمد".
 */
function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function getOptionSearchKey(opt: SearchableSelectOption): string {
  const base = opt.searchText ?? `${opt.label} ${opt.hint ?? ""}`;
  return normalise(base);
}

/**
 * Subscribe to a CSS media query as an external store so the value updates
 * via `useSyncExternalStore` (no `useEffect` + `setState` required).
 */
function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined") return fallback;
    return window.matchMedia(query).matches;
  }, [query, fallback]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Returns true once we're mounted on the client (so we can call createPortal).
 * Implemented via `useSyncExternalStore` to avoid setState-in-effect lint.
 */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

interface PopoverRect {
  top: number;
  left: number;
  width: number;
  /** Viewport-relative max height we may use without overflowing. */
  maxHeight: number;
  /** Whether the popover should open above (true) or below (false) the trigger. */
  flipUp: boolean;
}

const MIN_POPOVER_HEIGHT = 220;

/**
 * Drop-in replacement for `<select>` with built-in search, keyboard navigation,
 * grouping, and an RTL-friendly mobile sheet on small screens.
 *
 * The dropdown is portalled to `document.body` so it escapes any
 * `overflow:hidden` ancestors (e.g. modals).
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "اختر...",
  searchPlaceholder = "بحث سريع...",
  emptyMessage = "لا توجد نتائج",
  className,
  disabled = false,
  required = false,
  name,
  id,
  "aria-label": ariaLabel,
  searchThreshold = 6,
  clearable = false,
  title,
}: SearchableSelectProps) {
  const reactId = useId();
  const triggerId = id ?? `searchable-select-${reactId}`;
  const listboxId = `${triggerId}-listbox`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const isMobile = useMediaQuery("(max-width: 639px)");
  const mounted = useIsMounted();

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function commit(opt: NormalisedOption) {
    if (opt.disabled) return;
    onValueChange(opt.value);
    close();
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (
      e.key === "Enter" ||
      e.key === " " ||
      e.key === "ArrowDown" ||
      e.key === "ArrowUp"
    ) {
      e.preventDefault();
      setOpen(true);
    }
  }

  // The hidden input mirrors `value`, so native form validation
  // (`required`) keeps working for forms that submit via `<form onSubmit>`.
  const hiddenInput = (
    <input
      type="text"
      tabIndex={-1}
      aria-hidden="true"
      style={{
        position: "absolute",
        opacity: 0,
        pointerEvents: "none",
        width: "100%",
        height: 1,
        bottom: 0,
        right: 0,
      }}
      name={name}
      value={value}
      required={required}
      disabled={disabled}
      onChange={() => {
        /* controlled via onValueChange */
      }}
      onFocus={() => triggerRef.current?.focus()}
    />
  );

  const triggerLabel = selectedOption ? selectedOption.label : placeholder;
  const triggerHint = selectedOption?.hint;

  return (
    <div className="relative inline-block w-full" title={title}>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          DEFAULT_TRIGGER_CLASS,
          "flex items-center justify-between gap-2 text-right",
          disabled && "bg-gray-50 text-gray-400 cursor-not-allowed",
          !disabled && "hover:border-gray-300",
          !selectedOption && "text-gray-400",
          className,
        )}
      >
        <span className="flex-1 min-w-0 truncate text-right">
          {triggerLabel}
          {triggerHint && (
            <span className="text-[11px] text-gray-400 mr-2">
              {triggerHint}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0 text-gray-400">
          {clearable && selectedOption && !disabled && (
            <span
              role="button"
              aria-label="مسح الاختيار"
              tabIndex={-1}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onValueChange("");
              }}
              className="p-0.5 hover:text-gray-700 rounded cursor-pointer"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {hiddenInput}

      {open && mounted && (
        <SearchableSelectPopover
          listboxId={listboxId}
          options={options}
          value={value}
          isMobile={isMobile}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          showSearch={options.length >= searchThreshold || isMobile}
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          onCommit={commit}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Popover                                                                    */
/* -------------------------------------------------------------------------- */

interface PopoverProps {
  listboxId: string;
  options: SearchableSelectOption[];
  value: string;
  isMobile: boolean;
  searchPlaceholder: string;
  emptyMessage: string;
  showSearch: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCommit: (opt: NormalisedOption) => void;
}

/**
 * Mounted only while the popover is open, so search/active state resets
 * naturally without `setState`-in-effect anti-patterns.
 */
function SearchableSelectPopover({
  listboxId,
  options,
  value,
  isMobile,
  searchPlaceholder,
  emptyMessage,
  showSearch,
  triggerRef,
  onClose,
  onCommit,
}: PopoverProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const initialIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [popover, setPopover] = useState<PopoverRect | null>(null);

  const normalised = useMemo<NormalisedOption[]>(
    () => options.map((opt) => ({ ...opt, _searchKey: getOptionSearchKey(opt) })),
    [options],
  );

  const filtered = useMemo(() => {
    const q = normalise(query);
    if (!q) return normalised;
    return normalised.filter((opt) => opt._searchKey.includes(q));
  }, [normalised, query]);

  // Build group headers between options.
  const flatRows = useMemo(() => {
    type Row =
      | { kind: "group"; label: string }
      | { kind: "option"; option: NormalisedOption; idx: number };
    const rows: Row[] = [];
    let lastGroup: string | undefined = undefined;
    filtered.forEach((opt, idx) => {
      if (opt.group && opt.group !== lastGroup) {
        rows.push({ kind: "group", label: opt.group });
        lastGroup = opt.group;
      } else if (!opt.group) {
        lastGroup = undefined;
      }
      rows.push({ kind: "option", option: opt, idx });
    });
    return rows;
  }, [filtered]);

  // Keep the active item visible as the user navigates with the keyboard.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const node = list.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    if (node) node.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatRows.length]);

  // Auto-focus the search input on mount.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, []);

  // Reposition the desktop popover on scroll / resize.
  useLayoutEffect(() => {
    if (isMobile) return;
    const update = () => setPopover(computePosition(triggerRef.current));
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isMobile, triggerRef]);

  // Close on outside click + Escape.
  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      const inTrigger = triggerRef.current?.contains(target);
      const inList = listRef.current?.contains(target);
      const inInput = inputRef.current?.contains(target);
      if (!inTrigger && !inList && !inInput) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, triggerRef]);

  function moveActive(delta: number) {
    if (filtered.length === 0) return;
    setActiveIndex((prev) => {
      let next = prev + delta;
      let safety = filtered.length + 1;
      while (safety-- > 0) {
        if (next < 0) next = filtered.length - 1;
        if (next >= filtered.length) next = 0;
        const opt = filtered[next];
        if (opt && !opt.disabled) return next;
        next += delta > 0 ? 1 : -1;
      }
      return prev;
    });
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) onCommit(opt);
    } else if (e.key === "Tab") {
      onClose();
    }
  }

  const body = (
    <div
      className="flex flex-col bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ width: "100%", height: "100%" }}
    >
      {(showSearch || isMobile) && (
        <div className="p-2 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2 shrink-0">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              aria-label="مسح البحث"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X size={14} />
            </button>
          )}
          {isMobile && (
            <button
              type="button"
              aria-label="إغلاق"
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-800 rounded ml-1"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}
      <ul
        ref={listRef}
        role="listbox"
        id={listboxId}
        aria-activedescendant={
          filtered[activeIndex]
            ? `${listboxId}-opt-${activeIndex}`
            : undefined
        }
        className="overflow-y-auto py-1 text-sm flex-1"
        style={{ scrollbarGutter: "stable" }}
      >
        {flatRows.length === 0 ? (
          <li className="px-3 py-6 text-center text-gray-400 text-xs">
            {emptyMessage}
          </li>
        ) : (
          flatRows.map((row, rIdx) =>
            row.kind === "group" ? (
              <li
                key={`g-${row.label}-${rIdx}`}
                className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50/40 sticky top-0"
              >
                {row.label}
              </li>
            ) : (
              <li
                key={`o-${row.option.value}-${row.idx}`}
                id={`${listboxId}-opt-${row.idx}`}
                role="option"
                aria-selected={row.option.value === value}
                aria-disabled={row.option.disabled || undefined}
                data-idx={row.idx}
                onMouseEnter={() => setActiveIndex(row.idx)}
                onMouseDown={(e) => {
                  // Prevent the search input from blurring before we commit.
                  e.preventDefault();
                  onCommit(row.option);
                }}
                className={cn(
                  "px-3 py-2 cursor-pointer flex items-center gap-2 select-none",
                  row.idx === activeIndex && !row.option.disabled
                    ? "bg-primary/10 text-gray-900"
                    : "text-gray-700",
                  row.option.disabled && "opacity-40 cursor-not-allowed",
                  row.option.value === value && "font-semibold",
                )}
              >
                <span className="flex-1 min-w-0 truncate">
                  {row.option.label}
                  {row.option.hint && (
                    <span className="text-[11px] text-gray-400 mr-2">
                      {row.option.hint}
                    </span>
                  )}
                </span>
                {row.option.value === value && (
                  <Check size={14} className="text-primary shrink-0" />
                )}
              </li>
            ),
          )
        )}
      </ul>
    </div>
  );

  if (isMobile) {
    return createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="w-full bg-white rounded-t-2xl shadow-2xl flex flex-col"
          style={{ maxHeight: "80vh", height: "80vh" }}
          dir="rtl"
        >
          {body}
        </div>
      </div>,
      document.body,
    );
  }

  if (!popover) return null;

  return createPortal(
    <div
      className="z-[200]"
      style={{
        position: "fixed",
        top: popover.flipUp ? undefined : popover.top,
        bottom: popover.flipUp
          ? window.innerHeight - popover.top
          : undefined,
        left: popover.left,
        width: popover.width,
        maxHeight: popover.maxHeight,
        display: "flex",
        flexDirection: "column",
      }}
      dir="rtl"
    >
      {body}
    </div>,
    document.body,
  );
}

function computePosition(trigger: HTMLButtonElement | null): PopoverRect | null {
  if (!trigger || typeof window === "undefined") return null;
  const rect = trigger.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const spaceBelow = viewportH - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const flipUp = spaceBelow < MIN_POPOVER_HEIGHT && spaceAbove > spaceBelow;
  const maxHeight = Math.max(160, Math.min(360, flipUp ? spaceAbove : spaceBelow));
  return {
    top: flipUp ? rect.top - 4 : rect.bottom + 4,
    left: rect.left,
    width: rect.width,
    maxHeight,
    flipUp,
  };
}

export default SearchableSelect;
