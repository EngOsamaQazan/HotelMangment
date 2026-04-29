"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Calculator,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Globe,
  Info,
  Leaf,
  Loader2,
  Lock,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Monitor,
  Moon,
  PaperclipIcon,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  Volume2,
  Wallet,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  CATEGORY_LABELS,
  type EventCategory,
  type EventDef,
} from "@/lib/notifications/events";
import {
  CHANNELS,
  CHANNEL_KEYS,
  DIGEST_MODES,
  type ChannelDef,
  type DigestMode,
  type EventChannel,
} from "@/lib/notifications/channels";

const CHANNEL_ICONS: Record<EventChannel, LucideIcon> = {
  in_app: Bell,
  email: Mail,
  whatsapp: MessageCircle,
  web_push: Monitor,
  sound: Volume2,
};

const CATEGORY_ICONS_LUCIDE: Record<EventCategory, LucideIcon> = {
  reservations: CalendarCheck,
  tasks: ClipboardList,
  chat: MessageSquare,
  whatsapp: MessageCircle,
  maintenance: Wrench,
  finance: Wallet,
  accounting: Calculator,
  security: Shield,
  system: Megaphone,
};

interface PreferenceRow {
  eventCode: string;
  channel: string;
  isEnabled: boolean;
  digestMode: DigestMode;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
}

interface CatalogResponse {
  events: EventDef[];
  channels: ChannelDef[];
  categories: { key: EventCategory; label: string; icon: string }[];
}

interface PreferencesResponse {
  prefs: Record<string, PreferenceRow>;
  summary: { activeChannels: number; activeEvents: number; totalEvents: number };
}

const TZ_OPTIONS = [
  "Asia/Amman",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Bahrain",
  "Africa/Cairo",
];

/**
 * Editable in-memory shape of the preferences table.
 *   Keyed by `${eventCode}:${channel}`.
 *   Special keys: `*:<channel>` (master), `*:in_app` (also holds quiet-hours).
 */
type PrefMap = Record<string, PreferenceRow>;

function defaultRow(
  eventCode: string,
  channel: EventChannel,
  defaults?: { quietStart?: string | null; quietEnd?: string | null; tz?: string },
): PreferenceRow {
  return {
    eventCode,
    channel,
    isEnabled: true,
    digestMode: "instant",
    quietHoursStart: defaults?.quietStart ?? null,
    quietHoursEnd: defaults?.quietEnd ?? null,
    timezone: defaults?.tz ?? "Asia/Amman",
  };
}

export function NotificationPreferencesScreen() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [prefs, setPrefs] = useState<PrefMap>({});
  const [summary, setSummary] = useState<PreferencesResponse["summary"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );
  const [openEvents, setOpenEvents] = useState<Record<string, boolean>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const dirty = dirtyKeys.size > 0;
  const initialPrefsRef = useRef<PrefMap>({});

  // ── Load ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([
        fetch("/api/notifications/events", { cache: "no-store" }).then((r) =>
          r.json(),
        ),
        fetch("/api/notifications/preferences", { cache: "no-store" }).then(
          (r) => r.json(),
        ),
      ]);
      setCatalog(c as CatalogResponse);
      setPrefs((p as PreferencesResponse).prefs || {});
      initialPrefsRef.current = (p as PreferencesResponse).prefs || {};
      setSummary((p as PreferencesResponse).summary);
      setDirtyKeys(new Set());
      // Open the first category by default for visibility.
      const firstCat = (c as CatalogResponse)?.categories?.[0]?.key;
      if (firstCat) setOpenCategories({ [firstCat]: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Helpers ─────────────────────────────────────────────────
  const userFacingEvents = useMemo(
    () => (catalog?.events || []).filter((e) => e.isUserFacing !== false),
    [catalog],
  );

  const eventsByCategory = useMemo(() => {
    const map = new Map<EventCategory, EventDef[]>();
    for (const e of userFacingEvents) {
      const arr = map.get(e.category) ?? [];
      arr.push(e);
      map.set(e.category, arr);
    }
    return map;
  }, [userFacingEvents]);

  /** Returns a row, falling back to event defaults if no row was stored. */
  const readRow = useCallback(
    (
      eventCode: string,
      channel: EventChannel,
      event?: EventDef,
    ): { isEnabled: boolean; digestMode: DigestMode } => {
      const row = prefs[`${eventCode}:${channel}`];
      if (row) {
        return { isEnabled: row.isEnabled, digestMode: row.digestMode };
      }
      const def = event && event.defaultChannels.includes(channel);
      return { isEnabled: !!def, digestMode: "instant" };
    },
    [prefs],
  );

  /** Returns the master toggle for a channel (default ON when no row). */
  const readMaster = useCallback(
    (channel: EventChannel) => {
      const row = prefs[`*:${channel}`];
      return row ? row.isEnabled : true;
    },
    [prefs],
  );

  // The user-wide quiet-hours / timezone are stored on the in_app master.
  const globalRow = prefs["*:in_app"];
  const qhStart = globalRow?.quietHoursStart ?? "";
  const qhEnd = globalRow?.quietHoursEnd ?? "";
  const tz = globalRow?.timezone ?? "Asia/Amman";

  // ── Mutations ───────────────────────────────────────────────
  const updateRow = useCallback(
    (
      eventCode: string,
      channel: EventChannel,
      patch: Partial<PreferenceRow>,
    ) => {
      const k = `${eventCode}:${channel}`;
      setPrefs((prev) => {
        const cur =
          prev[k] ??
          defaultRow(eventCode, channel, {
            quietStart: globalRow?.quietHoursStart,
            quietEnd: globalRow?.quietHoursEnd,
            tz: globalRow?.timezone,
          });
        return { ...prev, [k]: { ...cur, ...patch } };
      });
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        next.add(k);
        return next;
      });
    },
    [globalRow],
  );

  const setMaster = useCallback(
    (channel: EventChannel, enabled: boolean) => {
      updateRow("*", channel, { isEnabled: enabled });
    },
    [updateRow],
  );

  const setEventChannel = useCallback(
    (event: EventDef, channel: EventChannel, enabled: boolean) => {
      if (event.isCritical && event.defaultChannels.includes(channel)) return;
      updateRow(event.code, channel, { isEnabled: enabled });
    },
    [updateRow],
  );

  const setEventDigest = useCallback(
    (event: EventDef, mode: DigestMode) => {
      // Apply digest to all default channels for this event.
      for (const ch of CHANNEL_KEYS) {
        const existing = prefs[`${event.code}:${ch}`];
        const isDefault = event.defaultChannels.includes(ch);
        if (existing || isDefault) {
          updateRow(event.code, ch, { digestMode: mode });
        }
      }
    },
    [prefs, updateRow],
  );

  const setEventMaster = useCallback(
    (event: EventDef, enabled: boolean) => {
      if (event.isCritical) return;
      for (const ch of CHANNEL_KEYS) {
        // Only flip channels the event *actually* uses by default — leave
        // exotic toggles (email when default is in_app) alone unless user
        // turned them on previously.
        const isDefault = event.defaultChannels.includes(ch);
        const has = !!prefs[`${event.code}:${ch}`];
        if (isDefault || has) {
          updateRow(event.code, ch, { isEnabled: enabled });
        }
      }
    },
    [prefs, updateRow],
  );

  const setQuietHours = useCallback(
    (patch: { start?: string | null; end?: string | null; tz?: string }) => {
      const start = patch.start === undefined ? qhStart : patch.start;
      const end = patch.end === undefined ? qhEnd : patch.end;
      const newTz = patch.tz === undefined ? tz : patch.tz;
      // Apply to every channel master row so each channel honours quiet hours.
      for (const ch of CHANNEL_KEYS) {
        updateRow("*", ch, {
          quietHoursStart: start || null,
          quietHoursEnd: end || null,
          timezone: newTz || "Asia/Amman",
        });
      }
    },
    [qhStart, qhEnd, tz, updateRow],
  );

  const isEventEnabled = useCallback(
    (event: EventDef) => {
      for (const ch of CHANNEL_KEYS) {
        if (readRow(event.code, ch, event).isEnabled) return true;
      }
      return false;
    },
    [readRow],
  );

  const eventDigestMode = useCallback(
    (event: EventDef): DigestMode => {
      for (const ch of CHANNEL_KEYS) {
        const row = prefs[`${event.code}:${ch}`];
        if (row) return row.digestMode;
      }
      return "instant";
    },
    [prefs],
  );

  // ── Save & presets ──────────────────────────────────────────
  const save = useCallback(async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      const payload = Object.values(prefs).map((r) => ({
        eventCode: r.eventCode,
        channel: r.channel,
        isEnabled: r.isEnabled,
        digestMode: r.digestMode,
        quietHoursStart: r.quietHoursStart,
        quietHoursEnd: r.quietHoursEnd,
        timezone: r.timezone,
      }));
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: payload }),
      });
      if (!res.ok) throw new Error("فشل الحفظ");
      const data = (await res.json()) as PreferencesResponse;
      setPrefs(data.prefs || {});
      initialPrefsRef.current = data.prefs || {};
      setSummary(data.summary);
      setDirtyKeys(new Set());
      toast.success("تم حفظ التفضيلات");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setSaving(false);
    }
  }, [dirty, prefs]);

  const discard = useCallback(() => {
    setPrefs(initialPrefsRef.current);
    setDirtyKeys(new Set());
  }, []);

  const presetEnableAll = useCallback(() => {
    if (!catalog) return;
    for (const ch of CHANNEL_KEYS) setMaster(ch as EventChannel, true);
    for (const ev of userFacingEvents) {
      if (ev.isCritical) continue;
      for (const ch of ev.defaultChannels) {
        updateRow(ev.code, ch, { isEnabled: true });
      }
    }
  }, [catalog, setMaster, updateRow, userFacingEvents]);

  const presetMinimal = useCallback(() => {
    if (!catalog) return;
    // Master: only in_app on; everything else off.
    for (const ch of CHANNEL_KEYS) {
      setMaster(ch as EventChannel, ch === "in_app");
    }
    // Per-event: keep only in_app on, the rest off.
    for (const ev of userFacingEvents) {
      if (ev.isCritical) continue;
      for (const ch of CHANNEL_KEYS) {
        if (ev.defaultChannels.includes(ch) || prefs[`${ev.code}:${ch}`]) {
          updateRow(ev.code, ch, { isEnabled: ch === "in_app" });
        }
      }
    }
  }, [catalog, prefs, setMaster, updateRow, userFacingEvents]);

  const presetReset = useCallback(() => {
    if (!confirm("ستُعاد كل الإعدادات إلى الوضع الافتراضي. متابعة؟")) return;
    if (!catalog) return;
    for (const ch of CHANNEL_KEYS) setMaster(ch as EventChannel, true);
    for (const ev of userFacingEvents) {
      for (const ch of CHANNEL_KEYS) {
        const isDefault = ev.defaultChannels.includes(ch);
        if (isDefault || prefs[`${ev.code}:${ch}`]) {
          updateRow(ev.code, ch, {
            isEnabled: isDefault,
            digestMode: "instant",
          });
        }
      }
    }
  }, [catalog, prefs, setMaster, updateRow, userFacingEvents]);

  const sendTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(data?.error || "فشل إرسال الاختبار");
        return;
      }
      toast.success("تم الإرسال — تحقق من الجرس");
      window.dispatchEvent(new CustomEvent("notifications:changed"));
    } finally {
      setTesting(false);
    }
  }, []);

  // ── Search filter ──────────────────────────────────────────
  const matchesSearch = useCallback(
    (event: EventDef) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const haystack = `${event.nameAr} ${event.descriptionAr} ${event.code}`.toLowerCase();
      return haystack.includes(q);
    },
    [search],
  );

  // ── Render ─────────────────────────────────────────────────
  if (loading || !catalog || !summary) {
    return (
      <div className="bg-card-bg rounded-xl shadow-sm p-12 text-center">
        <Loader2 size={22} className="animate-spin text-primary inline-block" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="تفضيلات الإشعارات"
        description="تحكم بكل ما يصلك — القنوات، الأنواع، الأولوية، وساعات الهدوء."
        icon={<Sliders size={22} />}
        backHref="/notifications"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={sendTest}
              disabled={testing}
              className="tap-44 flex items-center gap-1.5 text-sm px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
            >
              {testing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              إرسال إشعار تجريبي
            </button>
            <Link
              href="/notifications"
              className="tap-44 flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <ArrowLeft size={14} />
              مركز الإشعارات
            </Link>
          </div>
        }
      />

      {/* ─── Hero summary ─────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary/5 via-white to-emerald-50 border border-gray-100 rounded-xl shadow-sm p-4 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryStat
          icon={<Bell size={18} />}
          color="#7367f0"
          value={summary.activeChannels}
          total={CHANNEL_KEYS.length}
          label="قنوات مفعّلة"
        />
        <SummaryStat
          icon={<Sparkles size={18} />}
          color="#28c76f"
          value={summary.activeEvents}
          total={summary.totalEvents}
          label="أنواع نشطة"
        />
        <SummaryStat
          icon={<Moon size={18} />}
          color="#ff9f43"
          textValue={qhStart && qhEnd ? `${qhStart} – ${qhEnd}` : "غير مفعّلة"}
          label="ساعات الهدوء"
        />
      </div>

      {/* ─── Quick presets ────────────────────────────────── */}
      <div className="bg-card-bg rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-gray-500 me-2">إعدادات سريعة:</span>
        <button
          onClick={presetEnableAll}
          className="tap-44 flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <Zap size={13} />
          تفعيل الكل
        </button>
        <button
          onClick={presetMinimal}
          className="tap-44 flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <Leaf size={13} />
          الأساسيات فقط
        </button>
        <button
          onClick={presetReset}
          className="tap-44 flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={13} />
          الافتراضي
        </button>
        <button
          onClick={() => load()}
          className="tap-44 flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 ms-auto"
        >
          <RefreshCw size={13} />
          إعادة تحميل
        </button>
      </div>

      {/* ─── Channel master toggles ───────────────────────── */}
      <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-5">
        <header className="flex items-start gap-2 mb-4">
          <Settings size={18} className="text-primary mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-800">القنوات الرئيسية</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              إيقاف القناة هنا يُسكت كل الإشعارات على هذه القناة بصرف النظر
              عن إعدادات الأنواع أدناه. الإشعارات الحرجة (الأمان) تتجاوز هذه
              الإعدادات دائمًا.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CHANNELS.map((ch) => {
            const Icon = CHANNEL_ICONS[ch.key];
            const enabled = readMaster(ch.key);
            return (
              <ChannelCard
                key={ch.key}
                channel={ch}
                Icon={Icon}
                enabled={enabled}
                onToggle={(v) => setMaster(ch.key, v)}
              />
            );
          })}
        </div>
      </section>

      {/* ─── Per-event configuration ──────────────────────── */}
      <section className="bg-card-bg rounded-xl shadow-sm overflow-hidden">
        <header className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3 border-b border-gray-100">
          <div className="flex items-center gap-2 me-auto">
            <PaperclipIcon size={18} className="text-primary" />
            <h2 className="font-bold text-gray-800">أنواع الإشعارات</h2>
            <span className="text-xs text-gray-500">
              ({userFacingEvents.length})
            </span>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              size={14}
              className="absolute top-1/2 -translate-y-1/2 start-3 text-gray-400 pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن نوع إشعار..."
              className="w-full ps-9 pe-9 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute top-1/2 -translate-y-1/2 end-2 p-1 rounded-full hover:bg-gray-100 text-gray-500"
                aria-label="مسح"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </header>

        <div className="divide-y divide-gray-100">
          {(Object.keys(CATEGORY_LABELS) as EventCategory[])
            .filter((c) => eventsByCategory.has(c))
            .map((catKey) => {
              const allInCat = eventsByCategory.get(catKey) || [];
              const events = allInCat.filter(matchesSearch);
              if (search.trim() && !events.length) return null;
              const Icon = CATEGORY_ICONS_LUCIDE[catKey];
              const isOpen = !!openCategories[catKey] || !!search.trim();
              const activeCount = allInCat.filter(isEventEnabled).length;

              return (
                <div key={catKey}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCategories((prev) => ({
                        ...prev,
                        [catKey]: !prev[catKey],
                      }))
                    }
                    className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-start hover:bg-primary/5 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                      <Icon size={16} />
                    </span>
                    <span className="flex-1 font-bold text-gray-800 text-sm">
                      {CATEGORY_LABELS[catKey].label}
                    </span>
                    <span className="text-xs text-gray-500">
                      <span className="font-bold text-primary">{activeCount}</span>{" "}
                      / {allInCat.length} نشط
                    </span>
                    <ChevronDown
                      size={16}
                      className={cn(
                        "shrink-0 text-gray-400 transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {isOpen && (
                    <div className="border-t border-dashed border-gray-100 bg-gray-50/30">
                      {events.map((ev) => (
                        <EventRow
                          key={ev.code}
                          event={ev}
                          isOpen={!!openEvents[ev.code]}
                          isEnabled={isEventEnabled(ev)}
                          digestMode={eventDigestMode(ev)}
                          readRow={(ch) => readRow(ev.code, ch, ev)}
                          onToggleOpen={() =>
                            setOpenEvents((prev) => ({
                              ...prev,
                              [ev.code]: !prev[ev.code],
                            }))
                          }
                          onToggleEnabled={(v) => setEventMaster(ev, v)}
                          onToggleChannel={(ch, v) =>
                            setEventChannel(ev, ch, v)
                          }
                          onChangeDigest={(m) => setEventDigest(ev, m)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      {/* ─── Quiet hours ─────────────────────────────────── */}
      <section className="bg-card-bg rounded-xl shadow-sm p-4 sm:p-5">
        <header className="flex items-start gap-2 mb-4">
          <Moon size={18} className="text-primary mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-800">ساعات الهدوء</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              خلال هذه الساعات لن تصلك إشعارات صوتية أو منبثقة. الأحداث
              العاجلة والحرجة ستظل تصلك دائمًا.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FieldTime
            label="من الساعة"
            value={qhStart}
            onChange={(v) => setQuietHours({ start: v || null })}
          />
          <FieldTime
            label="إلى الساعة"
            value={qhEnd}
            onChange={(v) => setQuietHours({ end: v || null })}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1">
              <Globe size={12} /> المنطقة الزمنية
            </label>
            <select
              value={tz}
              onChange={(e) => setQuietHours({ tz: e.target.value })}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {TZ_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(qhStart || qhEnd) && (
          <button
            onClick={() =>
              setQuietHours({ start: null, end: null })
            }
            className="mt-3 tap-44 flex items-center gap-1 text-xs px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <X size={12} />
            مسح ساعات الهدوء
          </button>
        )}
      </section>

      <div style={{ height: 96 }} aria-hidden />

      {/* ─── Sticky save bar ─────────────────────────────── */}
      {dirty && (
        <div
          className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:start-1/2 sm:-translate-x-1/2 max-w-[640px] mx-auto z-40 bg-white border border-gray-200 rounded-2xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3"
          role="status"
          aria-live="polite"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-sm text-gray-700 me-auto">
            <strong>تغييرات غير محفوظة</strong>
            <span className="ms-2 text-amber-700 text-xs">
              {dirtyKeys.size} تعديل
            </span>
          </span>
          <button
            onClick={discard}
            className="tap-44 flex items-center gap-1.5 text-sm px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
            disabled={saving}
          >
            <RefreshCw size={13} />
            تجاهل
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="tap-44 flex items-center gap-1.5 text-sm px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            حفظ التغييرات
          </button>
        </div>
      )}
    </>
  );
}

// ───── Sub-components ─────────────────────────────────────────

function SummaryStat({
  icon,
  color,
  value,
  total,
  textValue,
  label,
}: {
  icon: React.ReactNode;
  color: string;
  value?: number;
  total?: number;
  textValue?: string;
  label: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
      <div className="flex items-center justify-center mb-1.5">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {textValue ?? value}
      </div>
      <div className="text-xs text-gray-500 font-bold mt-1">{label}</div>
      {typeof total === "number" && (
        <div className="text-[10px] text-gray-400 mt-0.5">من {total}</div>
      )}
    </div>
  );
}

function ChannelCard({
  channel,
  Icon,
  enabled,
  onToggle,
}: {
  channel: ChannelDef;
  Icon: LucideIcon;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "relative flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer select-none transition-all",
        enabled
          ? "bg-primary/5"
          : "bg-white hover:bg-gray-50 border-gray-200",
      )}
      style={{
        borderColor: enabled ? channel.color : undefined,
      }}
    >
      <span
        className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors"
        style={{
          backgroundColor: enabled ? channel.color : `${channel.color}1a`,
          color: enabled ? "#fff" : channel.color,
        }}
      >
        <Icon size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-800 text-sm">
            {channel.nameAr}
          </span>
          {channel.comingSoon && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
              قريبًا
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {channel.descriptionAr}
        </p>
      </div>
      <Switch
        checked={enabled}
        onChange={onToggle}
        ariaLabel={`تفعيل ${channel.nameAr}`}
        accent={channel.color}
      />
    </label>
  );
}

function EventRow({
  event,
  isOpen,
  isEnabled,
  digestMode,
  readRow,
  onToggleOpen,
  onToggleEnabled,
  onToggleChannel,
  onChangeDigest,
}: {
  event: EventDef;
  isOpen: boolean;
  isEnabled: boolean;
  digestMode: DigestMode;
  readRow: (ch: EventChannel) => { isEnabled: boolean; digestMode: DigestMode };
  onToggleOpen: () => void;
  onToggleEnabled: (v: boolean) => void;
  onToggleChannel: (ch: EventChannel, v: boolean) => void;
  onChangeDigest: (m: DigestMode) => void;
}) {
  return (
    <article className="px-4 sm:px-5 py-3 border-b border-dashed border-gray-100 last:border-b-0 hover:bg-white/70">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <span className="font-bold text-sm text-gray-800">
              {event.nameAr}
            </span>
            {event.isCritical && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                <Lock size={10} />
                حرج
              </span>
            )}
            {event.defaultPriority === 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                مرتفعة
              </span>
            )}
            {event.defaultPriority === 2 && !event.isCritical && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                عاجل
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{event.descriptionAr}</p>
          <code className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-mono">
            {event.code}
          </code>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleOpen}
            className="tap-44 flex items-center gap-1 text-xs px-2.5 py-1.5 border border-dashed border-gray-200 rounded-lg hover:bg-white text-gray-600"
            aria-expanded={isOpen}
          >
            <Sliders size={12} />
            تخصيص
          </button>
          <Switch
            checked={isEnabled}
            disabled={event.isCritical}
            onChange={onToggleEnabled}
            ariaLabel={`تفعيل ${event.nameAr}`}
          />
        </div>
      </div>
      {isOpen && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-gray-700 mb-2">
              القنوات المفعّلة لهذا النوع
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((c) => {
                const r = readRow(c.key);
                const Icon = CHANNEL_ICONS[c.key];
                const locked = event.isCritical && event.defaultChannels.includes(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => !locked && onToggleChannel(c.key, !r.isEnabled)}
                    disabled={locked}
                    className={cn(
                      "tap-44 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border-[1.5px] text-xs font-bold transition-colors",
                      r.isEnabled
                        ? "text-white"
                        : "bg-white text-gray-600 border-gray-200 hover:border-primary",
                      locked && "opacity-60 cursor-not-allowed",
                    )}
                    style={{
                      backgroundColor: r.isEnabled ? c.color : undefined,
                      borderColor: r.isEnabled ? c.color : undefined,
                    }}
                  >
                    <Icon size={11} />
                    {c.nameAr}
                    {locked && <Lock size={10} />}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-2">
              طريقة الوصول
            </p>
            <select
              value={digestMode}
              onChange={(e) => onChangeDigest(e.target.value as DigestMode)}
              className="w-full max-w-xs px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {DIGEST_MODES.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500">
              <Info size={10} className="text-primary" />
              يطبَّق على الأحداث غير العاجلة فقط.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function FieldTime({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-gray-700">{label}</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
  ariaLabel,
  accent,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
  accent?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 w-10 h-6 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        checked ? "bg-primary" : "bg-gray-300",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      style={{ backgroundColor: checked && accent ? accent : undefined }}
    >
      <span
        className={cn(
          "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all",
          checked ? "end-0.5" : "start-0.5",
        )}
      />
    </button>
  );
}
