"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Users,
  Loader2,
  Plus,
  Phone,
  MessageCircle,
  ClipboardCheck,
  Eye,
  X,
  Crown,
  Wallet,
  CalendarPlus,
  TrendingUp,
  UserPlus,
  MapPin,
  Clock,
  Sparkles,
  CalendarCheck,
  CalendarArrowDown,
  Hash,
  IdCard,
} from "lucide-react";
import { cn, formatAmount, formatDate, statusLabels } from "@/lib/utils";
import { findNationality } from "@/lib/countries";
import { Pagination, usePaginatedSlice } from "@/components/Pagination";
import { Can } from "@/components/Can";
import { usePermissions } from "@/lib/permissions/client";

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Types (mirror /api/guests)
// ---------------------------------------------------------------------------

interface StaySummary {
  reservationId: number;
  checkIn: string;
  checkOut: string;
  status: string;
  unitNumber: string;
  unitType: string;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  source: string;
  actualCheckInAt: string | null;
  actualCheckOutAt: string | null;
}

interface GuestProfile {
  key: string;
  fullName: string;
  idNumber: string;
  nationality: string;
  phone: string | null;
  tags: string[];
  stayCount: number;
  totalSpent: number;
  totalOutstanding: number;
  firstStayAt: string | null;
  lastStayAt: string | null;
  inHouseStay: StaySummary | null;
  upcomingStay: StaySummary | null;
  lastStay: StaySummary | null;
  stays: StaySummary[];
}

interface Summary {
  totalGuests: number;
  inHouse: number;
  arrivingToday: number;
  departingToday: number;
  repeat: number;
  withBalance: number;
  newThisMonth: number;
}

interface ApiResponse {
  guests: GuestProfile[];
  summary: Summary;
  nationalities: string[];
}

// ---------------------------------------------------------------------------
// Segments (tabs)
// ---------------------------------------------------------------------------

type Segment =
  | "all"
  | "inhouse"
  | "arriving"
  | "departing"
  | "upcoming"
  | "repeat"
  | "new"
  | "balance";

const SEGMENTS: { key: Segment; label: string; countKey: keyof Summary | null }[] = [
  { key: "all", label: "الكل", countKey: "totalGuests" },
  { key: "inhouse", label: "نازلون الآن", countKey: "inHouse" },
  { key: "arriving", label: "وصول اليوم", countKey: "arrivingToday" },
  { key: "departing", label: "مغادرة اليوم", countKey: "departingToday" },
  { key: "upcoming", label: "حجوزات قادمة", countKey: null },
  { key: "repeat", label: "ضيوف متكررون", countKey: "repeat" },
  { key: "new", label: "جدد", countKey: "newThisMonth" },
  { key: "balance", label: "لديهم رصيد", countKey: "withBalance" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a 2-letter ISO country code into its flag emoji (U+1F1E6 offset). */
function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "";
  const A = 0x1f1e6;
  const base = "A".charCodeAt(0);
  return String.fromCodePoint(
    A + code.toUpperCase().charCodeAt(0) - base,
    A + code.toUpperCase().charCodeAt(1) - base,
  );
}

/** 1–2 letter avatar initials for Arabic / Latin names. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Deterministic pastel colour for an avatar, from the guest's key. Using a
 * hash keeps the same guest the same colour across re-renders without storing
 * anything server-side.
 */
function avatarColor(seed: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "bg-rose-100", fg: "text-rose-700" },
    { bg: "bg-amber-100", fg: "text-amber-700" },
    { bg: "bg-emerald-100", fg: "text-emerald-700" },
    { bg: "bg-sky-100", fg: "text-sky-700" },
    { bg: "bg-violet-100", fg: "text-violet-700" },
    { bg: "bg-indigo-100", fg: "text-indigo-700" },
    { bg: "bg-teal-100", fg: "text-teal-700" },
    { bg: "bg-fuchsia-100", fg: "text-fuchsia-700" },
  ];
  return palette[h % palette.length];
}

/**
 * URL params to carry the guest's identity into the "New Reservation" page,
 * pre-filling name / ID / nationality / phone so the operator doesn't retype.
 */
function newBookingHref(p: GuestProfile): string {
  const q = new URLSearchParams();
  if (p.fullName) q.set("guestName", p.fullName);
  if (p.idNumber) q.set("idNumber", p.idNumber);
  if (p.nationality) q.set("nationality", p.nationality);
  if (p.phone) q.set("phone", p.phone);
  return `/reservations/new?${q.toString()}`;
}

/** wa.me link — digits only, no leading + / spaces. */
function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GuestsPage() {
  const { can } = usePermissions();
  const canCreate = can("reservations:create");

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [nationality, setNationality] = useState("");
  const [page, setPage] = useState(1);
  const [activeGuest, setActiveGuest] = useState<GuestProfile | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, segment, nationality]);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (segment !== "all") params.set("segment", segment);
      if (nationality) params.set("nationality", nationality);
      const res = await fetch(`/api/guests?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ApiResponse = await res.json();
      setData(json);
    } catch {
      setData({
        guests: [],
        summary: {
          totalGuests: 0,
          inHouse: 0,
          arrivingToday: 0,
          departingToday: 0,
          repeat: 0,
          withBalance: 0,
          newThisMonth: 0,
        },
        nationalities: [],
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, segment, nationality]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  const guests = data?.guests ?? [];
  const pagedGuests = usePaginatedSlice(guests, page, PAGE_SIZE);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <Users className="text-primary" size={24} />
            <h1 className="text-xl sm:text-2xl font-bold text-primary">
              سجل الضيوف
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            بطاقات الضيوف وسجل زياراتهم وإجراءات سريعة لكل ضيف
          </p>
        </div>
        <Can permission="reservations:create">
          <Link
            href="/reservations/new"
            className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-lg transition-colors font-medium w-full sm:w-auto shadow-sm"
          >
            <Plus size={18} />
            حجز جديد
          </Link>
        </Can>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* KPI strip                                                           */}
      {/* ------------------------------------------------------------------ */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            icon={<Users size={18} />}
            label="إجمالي الضيوف"
            value={data.summary.totalGuests}
            tone="slate"
            onClick={() => setSegment("all")}
            active={segment === "all"}
          />
          <KpiCard
            icon={<Sparkles size={18} />}
            label="نازلون الآن"
            value={data.summary.inHouse}
            tone="emerald"
            onClick={() => setSegment("inhouse")}
            active={segment === "inhouse"}
          />
          <KpiCard
            icon={<CalendarCheck size={18} />}
            label="وصول اليوم"
            value={data.summary.arrivingToday}
            tone="blue"
            onClick={() => setSegment("arriving")}
            active={segment === "arriving"}
          />
          <KpiCard
            icon={<CalendarArrowDown size={18} />}
            label="مغادرة اليوم"
            value={data.summary.departingToday}
            tone="amber"
            onClick={() => setSegment("departing")}
            active={segment === "departing"}
          />
          <KpiCard
            icon={<TrendingUp size={18} />}
            label="متكررون"
            value={data.summary.repeat}
            tone="indigo"
            onClick={() => setSegment("repeat")}
            active={segment === "repeat"}
          />
          <KpiCard
            icon={<Wallet size={18} />}
            label="عليهم رصيد"
            value={data.summary.withBalance}
            tone="rose"
            onClick={() => setSegment("balance")}
            active={segment === "balance"}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Segment tabs + filters                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {SEGMENTS.map((s) => {
            const count =
              data && s.countKey ? data.summary[s.countKey] : null;
            const active = segment === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSegment(s.key)}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  active
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-primary/40 hover:text-primary",
                )}
              >
                <span>{s.label}</span>
                {count != null && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[1.25rem] px-1.5 h-5 rounded-full text-[11px] font-semibold",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-gray-100 text-gray-700",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="بحث بالاسم أو رقم الهوية أو الهاتف أو الجنسية..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm"
            />
          </div>
          <select
            value={nationality}
            onChange={(e) => setNationality(e.target.value)}
            className="w-full md:w-64 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm bg-white"
          >
            <option value="">كل الجنسيات</option>
            {data?.nationalities.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* List                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-primary" size={32} />
            <span className="mr-3 text-gray-500">جاري تحميل الضيوف...</span>
          </div>
        ) : guests.length === 0 ? (
          <EmptyState hasSearch={!!debouncedSearch || !!nationality || segment !== "all"} canCreate={canCreate} />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">الضيف</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">التواصل</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">الحالة الحالية</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">الزيارات</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">الإنفاق الكلي</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">الرصيد</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-600">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGuests.map((p) => (
                    <GuestRow
                      key={p.key}
                      profile={p}
                      onOpen={() => setActiveGuest(p)}
                      canCreate={canCreate}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet */}
            <div className="lg:hidden divide-y divide-gray-100">
              {pagedGuests.map((p) => (
                <GuestCard
                  key={p.key}
                  profile={p}
                  onOpen={() => setActiveGuest(p)}
                  canCreate={canCreate}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Pagination                                                          */}
      {/* ------------------------------------------------------------------ */}
      {!loading && guests.length > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={guests.length}
          onChange={setPage}
          className="pt-2"
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Detail drawer                                                       */}
      {/* ------------------------------------------------------------------ */}
      {activeGuest && (
        <GuestDrawer
          profile={activeGuest}
          onClose={() => setActiveGuest(null)}
          canCreate={canCreate}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tile
// ---------------------------------------------------------------------------

type KpiTone = "slate" | "emerald" | "blue" | "amber" | "indigo" | "rose";

function KpiCard({
  icon,
  label,
  value,
  tone,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: KpiTone;
  onClick: () => void;
  active: boolean;
}) {
  const tones: Record<KpiTone, string> = {
    slate: "from-slate-50 to-slate-100 text-slate-700 border-slate-200",
    emerald: "from-emerald-50 to-emerald-100 text-emerald-800 border-emerald-200",
    blue: "from-blue-50 to-blue-100 text-blue-800 border-blue-200",
    amber: "from-amber-50 to-amber-100 text-amber-800 border-amber-200",
    indigo: "from-indigo-50 to-indigo-100 text-indigo-800 border-indigo-200",
    rose: "from-rose-50 to-rose-100 text-rose-800 border-rose-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-right rounded-xl border bg-gradient-to-br p-3 sm:p-4 transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30",
        tones[tone],
        active && "ring-2 ring-primary/40 shadow-md -translate-y-0.5",
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] sm:text-xs font-medium opacity-80">{label}</span>
        <span className="opacity-70">{icon}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold leading-none">{value}</div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Row (desktop)
// ---------------------------------------------------------------------------

function GuestRow({
  profile,
  onOpen,
  canCreate,
}: {
  profile: GuestProfile;
  onOpen: () => void;
  canCreate: boolean;
}) {
  const country = findNationality(profile.nationality);
  const flag = flagEmoji(country?.code);
  const color = avatarColor(profile.key);

  return (
    <tr
      className="border-b border-gray-50 hover:bg-primary/[0.02] transition-colors cursor-pointer align-top"
      onClick={onOpen}
    >
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
              color.bg,
              color.fg,
            )}
          >
            {initialsOf(profile.fullName)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-800 truncate">
                {profile.fullName}
              </span>
              {flag && <span className="text-base leading-none">{flag}</span>}
              <GuestTags tags={profile.tags} stayCount={profile.stayCount} />
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
              {profile.idNumber && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <IdCard size={12} />
                  {profile.idNumber}
                </span>
              )}
              {profile.nationality && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} />
                  {profile.nationality}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-gray-600 text-xs">
        {profile.phone ? (
          <div className="flex flex-col gap-1" dir="ltr">
            <span className="font-mono text-gray-700">{profile.phone}</span>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <StatusPill profile={profile} />
      </td>
      <td className="px-4 py-3 text-gray-700">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-gray-800">{profile.stayCount}</span>
          <span className="text-xs text-gray-400">زيارة</span>
        </div>
        {profile.lastStayAt && (
          <div className="text-[11px] text-gray-400 mt-0.5">
            آخر: {formatDate(profile.lastStayAt)}
          </div>
        )}
      </td>
      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
        {formatAmount(profile.totalSpent)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {profile.totalOutstanding > 0 ? (
          <span className="text-red-600 font-semibold">
            {formatAmount(profile.totalOutstanding)}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td
        className="px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            title="عرض الملف الكامل"
            className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            <Eye size={16} />
          </button>
          {profile.phone && (
            <a
              href={whatsappHref(profile.phone)}
              target="_blank"
              rel="noopener noreferrer"
              title="واتساب"
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <MessageCircle size={16} />
            </a>
          )}
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              title="اتصال"
              className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            >
              <Phone size={16} />
            </a>
          )}
          {canCreate && (
            <Link
              href={newBookingHref(profile)}
              title="حجز جديد لهذا الضيف"
              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <CalendarPlus size={16} />
            </Link>
          )}
          {profile.lastStay && (
            <Link
              href={`/reservations/${profile.lastStay.reservationId}`}
              title="عرض آخر حجز"
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ClipboardCheck size={16} />
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Card (mobile)
// ---------------------------------------------------------------------------

function GuestCard({
  profile,
  onOpen,
  canCreate,
}: {
  profile: GuestProfile;
  onOpen: () => void;
  canCreate: boolean;
}) {
  const country = findNationality(profile.nationality);
  const flag = flagEmoji(country?.code);
  const color = avatarColor(profile.key);
  return (
    <div className="p-4 space-y-3 active:bg-gray-50 transition-colors" onClick={onOpen}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm",
            color.bg,
            color.fg,
          )}
        >
          {initialsOf(profile.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-800 truncate">
              {profile.fullName}
            </span>
            {flag && <span className="text-base leading-none">{flag}</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <GuestTags tags={profile.tags} stayCount={profile.stayCount} />
          </div>
          <div className="mt-1.5 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
            {profile.idNumber && (
              <span className="font-mono inline-flex items-center gap-1">
                <IdCard size={12} />
                {profile.idNumber}
              </span>
            )}
            {profile.nationality && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {profile.nationality}
              </span>
            )}
            {profile.phone && (
              <span className="font-mono inline-flex items-center gap-1" dir="ltr">
                <Phone size={12} />
                {profile.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      <StatusPill profile={profile} />

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400 mb-0.5">الزيارات</p>
          <p className="font-bold text-gray-800">{profile.stayCount}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400 mb-0.5">الإنفاق</p>
          <p className="font-bold text-gray-800">
            {formatAmount(profile.totalSpent)}
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg p-2",
            profile.totalOutstanding > 0 ? "bg-red-50" : "bg-gray-50",
          )}
        >
          <p className="text-gray-400 mb-0.5">الرصيد</p>
          <p
            className={cn(
              "font-bold",
              profile.totalOutstanding > 0 ? "text-red-600" : "text-gray-500",
            )}
          >
            {formatAmount(profile.totalOutstanding)}
          </p>
        </div>
      </div>

      <div
        className="flex items-center gap-2 pt-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-primary bg-primary/5 rounded-lg text-xs font-medium"
        >
          <Eye size={14} />
          الملف
        </button>
        {profile.phone && (
          <a
            href={whatsappHref(profile.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1 py-2 text-emerald-600 bg-emerald-50 rounded-lg text-xs font-medium"
          >
            <MessageCircle size={14} />
            واتساب
          </a>
        )}
        {canCreate && (
          <Link
            href={newBookingHref(profile)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-amber-700 bg-amber-50 rounded-lg text-xs font-medium"
          >
            <CalendarPlus size={14} />
            حجز
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tags / badges
// ---------------------------------------------------------------------------

function GuestTags({ tags, stayCount }: { tags: string[]; stayCount: number }) {
  const has = (t: string) => tags.includes(t);
  return (
    <>
      {has("inhouse") && (
        <Badge tone="emerald" icon={<Sparkles size={10} />}>
          نازل الآن
        </Badge>
      )}
      {has("arriving_today") && !has("inhouse") && (
        <Badge tone="blue" icon={<CalendarCheck size={10} />}>
          وصول اليوم
        </Badge>
      )}
      {has("departing_today") && (
        <Badge tone="amber" icon={<CalendarArrowDown size={10} />}>
          مغادرة اليوم
        </Badge>
      )}
      {stayCount >= 5 && (
        <Badge tone="purple" icon={<Crown size={10} />}>
          VIP متكرر
        </Badge>
      )}
      {stayCount >= 3 && stayCount < 5 && (
        <Badge tone="indigo" icon={<TrendingUp size={10} />}>
          متكرر ({stayCount})
        </Badge>
      )}
      {has("new_this_month") && stayCount === 1 && (
        <Badge tone="sky" icon={<UserPlus size={10} />}>
          جديد
        </Badge>
      )}
      {has("has_balance") && (
        <Badge tone="rose" icon={<Wallet size={10} />}>
          رصيد مستحق
        </Badge>
      )}
    </>
  );
}

type BadgeTone = "emerald" | "blue" | "amber" | "indigo" | "sky" | "rose" | "purple" | "gray";

function Badge({
  tone,
  icon,
  children,
}: {
  tone: BadgeTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones: Record<BadgeTone, string> = {
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
    sky: "bg-sky-100 text-sky-800 border-sky-200",
    rose: "bg-rose-100 text-rose-800 border-rose-200",
    purple: "bg-purple-100 text-purple-800 border-purple-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border",
        tones[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status pill (Current stay / upcoming / past)
// ---------------------------------------------------------------------------

function StatusPill({ profile }: { profile: GuestProfile }) {
  if (profile.inHouseStay) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
          <Sparkles size={12} /> نازل الآن
        </span>
        <span className="text-xs text-gray-500">
          غرفة {profile.inHouseStay.unitNumber} · حتى{" "}
          {formatDate(profile.inHouseStay.checkOut)}
        </span>
      </div>
    );
  }
  if (profile.upcomingStay) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full">
          <CalendarCheck size={12} /> حجز قادم
        </span>
        <span className="text-xs text-gray-500">
          {formatDate(profile.upcomingStay.checkIn)}
        </span>
      </div>
    );
  }
  if (profile.lastStay) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 border border-gray-200 px-2 py-1 rounded-full">
          <Clock size={12} /> ضيف سابق
        </span>
        <span className="text-xs text-gray-400">
          {formatDate(profile.lastStay.checkOut)}
        </span>
      </div>
    );
  }
  return <span className="text-xs text-gray-400">—</span>;
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  hasSearch,
  canCreate,
}: {
  hasSearch: boolean;
  canCreate: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 px-4 text-center">
      <Users size={48} className="mb-3 opacity-50" />
      <p className="text-lg font-medium text-gray-600">لا يوجد ضيوف</p>
      <p className="text-sm mt-1 max-w-md">
        {hasSearch
          ? "لم يتم العثور على ضيوف يطابقون عوامل التصفية الحالية. جرّب إزالة بعضها."
          : "سيظهر كل ضيف دخل الفندق هنا تلقائيًا بمجرد إنشاء حجز."}
      </p>
      {canCreate && !hasSearch && (
        <Link
          href="/reservations/new"
          className="mt-4 inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} />
          إنشاء حجز جديد
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer (Guest 360)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  upcoming: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-800",
  pending_hold: "bg-amber-100 text-amber-800",
};

function GuestDrawer({
  profile,
  onClose,
  canCreate,
}: {
  profile: GuestProfile;
  onClose: () => void;
  canCreate: boolean;
}) {
  // Close on ESC.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const country = findNationality(profile.nationality);
  const flag = flagEmoji(country?.code);
  const color = avatarColor(profile.key);

  const memberSince = useMemo(() => {
    if (!profile.firstStayAt) return null;
    const d = new Date(profile.firstStayAt);
    return d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  }, [profile.firstStayAt]);

  return (
    <div className="fixed inset-0 z-[80] flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel (slides in from the LEFT in RTL, which is visually "start") */}
      <div className="relative ml-auto w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-[slideIn_.2s_ease-out]">
        <style>{`@keyframes slideIn {from{transform:translateX(-24px);opacity:.7}to{transform:none;opacity:1}}`}</style>

        {/* Header */}
        <div className="p-5 border-b border-gray-100 bg-gradient-to-bl from-primary/5 to-transparent">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={cn(
                  "shrink-0 w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg",
                  color.bg,
                  color.fg,
                )}
              >
                {initialsOf(profile.fullName)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-lg text-gray-900 truncate">
                    {profile.fullName}
                  </h2>
                  {flag && <span className="text-xl leading-none">{flag}</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <GuestTags tags={profile.tags} stayCount={profile.stayCount} />
                </div>
                {memberSince && (
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    أول زيارة في {memberSince}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              aria-label="إغلاق"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Contact */}
          <section className="p-5 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              بيانات التواصل
            </h3>
            <div className="space-y-2 text-sm">
              {profile.idNumber && (
                <InfoRow icon={<IdCard size={14} />} label="رقم الهوية">
                  <span className="font-mono">{profile.idNumber}</span>
                </InfoRow>
              )}
              {profile.nationality && (
                <InfoRow icon={<MapPin size={14} />} label="الجنسية">
                  {profile.nationality}
                </InfoRow>
              )}
              {profile.phone && (
                <InfoRow icon={<Phone size={14} />} label="الهاتف">
                  <span className="font-mono" dir="ltr">
                    {profile.phone}
                  </span>
                </InfoRow>
              )}
              {!profile.phone && !profile.idNumber && !profile.nationality && (
                <p className="text-xs text-gray-400">لا توجد بيانات إضافية</p>
              )}
            </div>
          </section>

          {/* Stats */}
          <section className="p-5 border-b border-gray-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              إحصاءات الضيف
            </h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <StatTile label="الزيارات" value={profile.stayCount.toString()} tone="indigo" />
              <StatTile
                label="الإنفاق الكلي"
                value={formatAmount(profile.totalSpent)}
                tone="emerald"
              />
              <StatTile
                label="الرصيد المستحق"
                value={formatAmount(profile.totalOutstanding)}
                tone={profile.totalOutstanding > 0 ? "rose" : "gray"}
              />
            </div>
          </section>

          {/* Timeline */}
          <section className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              سجل الإقامات ({profile.stayCount})
            </h3>
            <ol className="space-y-3">
              {profile.stays.map((s) => (
                <li
                  key={s.reservationId}
                  className="relative pr-6 border-r-2 border-gray-100"
                >
                  <span
                    className={cn(
                      "absolute right-[-6px] top-2 w-2.5 h-2.5 rounded-full",
                      s.status === "active" && "bg-emerald-500",
                      s.status === "upcoming" && "bg-blue-500",
                      s.status === "completed" && "bg-gray-400",
                      s.status === "cancelled" && "bg-red-400",
                      s.status === "pending_hold" && "bg-amber-400",
                    )}
                  />
                  <Link
                    href={`/reservations/${s.reservationId}`}
                    className="block rounded-lg border border-gray-100 hover:border-primary/40 hover:bg-primary/[0.02] p-3 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <Hash size={12} />
                        {s.reservationId}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold",
                          STATUS_COLORS[s.status] ||
                            "bg-gray-100 text-gray-700",
                        )}
                      >
                        {statusLabels[s.status] || s.status}
                      </span>
                    </div>
                    <div className="mt-1.5 text-sm font-medium text-gray-800">
                      وحدة {s.unitNumber}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {formatDate(s.checkIn)} — {formatDate(s.checkOut)}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        إجمالي:{" "}
                        <span className="font-semibold text-gray-700">
                          {formatAmount(s.totalAmount)}
                        </span>
                      </span>
                      {s.remaining > 0 && (
                        <span className="text-red-600 font-semibold">
                          متبقٍ {formatAmount(s.remaining)}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
              {profile.stays.length === 0 && (
                <li className="text-sm text-gray-400">لا توجد إقامات</li>
              )}
            </ol>
          </section>
        </div>

        {/* Footer actions */}
        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
          <div className="flex items-center gap-2">
            {canCreate && (
              <Link
                href={newBookingHref(profile)}
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                <CalendarPlus size={16} />
                حجز جديد لهذا الضيف
              </Link>
            )}
            {profile.phone && (
              <a
                href={whatsappHref(profile.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors"
              >
                <MessageCircle size={16} />
                واتساب
              </a>
            )}
            {profile.lastStay && (
              <Link
                href={`/reservations/${profile.lastStay.reservationId}`}
                onClick={onClose}
                className="inline-flex items-center gap-1 border border-gray-200 bg-white text-gray-700 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                <Eye size={16} />
                آخر حجز
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-gray-500 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-sm text-gray-800 text-left">{children}</span>
    </div>
  );
}

type StatTone = "indigo" | "emerald" | "rose" | "gray";

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: StatTone;
}) {
  const tones: Record<StatTone, string> = {
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <div className={cn("rounded-lg border p-2.5", tones[tone])}>
      <p className="text-[10px] opacity-80 mb-1">{label}</p>
      <p className="text-base font-bold leading-none">{value}</p>
    </div>
  );
}
