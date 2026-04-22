"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { publicPhotoUrl } from "@/lib/public-image";
import {
  CalendarRange,
  Users,
  Sparkles,
  ShieldCheck,
  Clock3,
  BedDouble,
  Maximize,
  Utensils,
  Sun,
  Loader2,
  AlertTriangle,
  Search,
} from "lucide-react";

/**
 * `/book` — single-page booking funnel entry point.
 *
 * Everything happens in-page now: typing a search pushes the query to the
 * URL (so it's shareable / back-button friendly), fires the availability
 * API, and renders the results right underneath the form. No navigation
 * away until the guest actually clicks into a specific room detail.
 */

interface Result {
  unitTypeId: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm: number | null;
  hasKitchen: boolean;
  hasBalcony: boolean;
  view: string | null;
  basePriceDaily: number | null;
  availableCount: number;
  primaryPhotoUrl: string | null;
  primaryPhotoId: number | null;
}

interface AvailabilityResponse {
  checkIn: string;
  checkOut: string;
  guests: number;
  results: Result[];
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function countNights(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.max(
    0,
    Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

function formatDate(d: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
}

function BookInner() {
  const params = useSearchParams();
  const router = useRouter();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);
  const dayAfter = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return d;
  }, [today]);

  const [checkIn, setCheckIn] = useState<string>(
    params.get("checkIn") || toYMD(tomorrow),
  );
  const [checkOut, setCheckOut] = useState<string>(
    params.get("checkOut") || toYMD(dayAfter),
  );
  const [guests, setGuests] = useState<number>(
    Math.max(1, Number(params.get("guests") || 2)),
  );
  const [formError, setFormError] = useState("");

  // Results state — only populated once the user actually searches.
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");
  const [hasSearched, setHasSearched] = useState<boolean>(
    !!(params.get("checkIn") && params.get("checkOut")),
  );
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const minCheckIn = toYMD(today);
  const minCheckOut = useMemo(() => {
    const d = new Date(checkIn);
    d.setDate(d.getDate() + 1);
    return toYMD(d);
  }, [checkIn]);

  const nights = useMemo(
    () => countNights(checkIn, checkOut),
    [checkIn, checkOut],
  );

  const runSearch = useCallback(
    async (ci: string, co: string, g: number, opts?: { scroll?: boolean }) => {
      setLoading(true);
      setResultsError("");
      try {
        const q = new URLSearchParams({
          checkIn: ci,
          checkOut: co,
          guests: String(g),
        });
        const res = await fetch(`/api/book/availability?${q.toString()}`);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "تعذّر جلب التوافر.");
        }
        const body = (await res.json()) as AvailabilityResponse;
        setData(body);
        if (opts?.scroll) {
          requestAnimationFrame(() => {
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }
      } catch (e) {
        setResultsError(e instanceof Error ? e.message : "خطأ غير متوقع.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-run when arriving with URL params (deep links / back button).
  useEffect(() => {
    const ci = params.get("checkIn");
    const co = params.get("checkOut");
    const g = Number(params.get("guests") || 0);
    if (ci && co && g > 0) {
      setHasSearched(true);
      void runSearch(ci, co, g);
    }
    // Intentionally run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const ci = new Date(checkIn);
    const co = new Date(checkOut);
    if (Number.isNaN(ci.getTime()) || Number.isNaN(co.getTime())) {
      setFormError("يرجى اختيار تواريخ صالحة.");
      return;
    }
    if (co <= ci) {
      setFormError("تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول.");
      return;
    }
    const q = new URLSearchParams({
      checkIn,
      checkOut,
      guests: String(guests),
    });
    // Shallow URL update so results are shareable without a page nav.
    router.replace(`/book?${q.toString()}`, { scroll: false });
    setHasSearched(true);
    void runSearch(checkIn, checkOut, guests, { scroll: true });
  }

  return (
    <GuestShell active="book" lightHeader fullBleed>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/brand-1.jpeg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70" />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 md:pt-20 pb-16 md:pb-24 text-white">
          <div className="text-center mb-8">
            <p className="text-gold font-semibold tracking-widest text-xs uppercase mb-2">
              فندق المفرق · حجز مباشر
            </p>
            <h1 className="text-3xl md:text-5xl font-bold leading-tight drop-shadow">
              إقامتك تبدأ بنقرة واحدة
            </h1>
            <p className="mt-3 text-sm md:text-base text-white/80 max-w-2xl mx-auto">
              اختر تواريخك وعدد الضيوف، وسنعرض لك فوراً الغرف والشقق المتاحة
              مع أحدث الأسعار — بدون عمولات طرف ثالث.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-4 sm:p-6 grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4"
          >
            <div className="md:col-span-1">
              <label className="text-[11px] font-bold text-primary mb-1 flex items-center gap-1">
                <CalendarRange size={14} /> تاريخ الوصول
              </label>
              <input
                type="date"
                value={checkIn}
                min={minCheckIn}
                onChange={(e) => {
                  setCheckIn(e.target.value);
                  if (checkOut <= e.target.value) {
                    const d = new Date(e.target.value);
                    d.setDate(d.getDate() + 1);
                    setCheckOut(toYMD(d));
                  }
                }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div className="md:col-span-1">
              <label className="text-[11px] font-bold text-primary mb-1 flex items-center gap-1">
                <CalendarRange size={14} /> تاريخ المغادرة
              </label>
              <input
                type="date"
                value={checkOut}
                min={minCheckOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
              />
            </div>
            <div className="md:col-span-1">
              <label className="text-[11px] font-bold text-primary mb-1 flex items-center gap-1">
                <Users size={14} /> عدد الضيوف
              </label>
              <select
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-primary focus:border-transparent outline-none bg-white"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "ضيف" : "ضيوف"}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1 flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white font-bold py-3 rounded-lg hover:bg-primary-dark shadow-md transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    يجري البحث…
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    ابحث عن الغرف المتاحة
                  </>
                )}
              </button>
            </div>

            {formError && (
              <div className="md:col-span-4 bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg text-center">
                {formError}
              </div>
            )}
          </form>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 text-sm text-white/90">
            <Highlight
              icon={<Sparkles size={18} className="text-gold" />}
              title="أفضل سعر مضمون"
              body="احجز مباشرة من الموقع واستفد من الأسعار الخاصة دون وسيط."
            />
            <Highlight
              icon={<ShieldCheck size={18} className="text-gold" />}
              title="دفع لاحق في الفندق"
              body="يمكنك تثبيت الحجز الآن وتأكيد الدفع عند الوصول."
            />
            <Highlight
              icon={<Clock3 size={18} className="text-gold" />}
              title="إلغاء مرن"
              body="سياسة إلغاء واضحة تتيح لك تعديل خطط رحلتك بسهولة."
            />
          </div>
        </div>
      </section>

      {/* Inline results — appear right below the hero once the user searches. */}
      <section
        ref={resultsRef}
        className="max-w-5xl mx-auto px-4 sm:px-6 py-8 md:py-12"
      >
        {hasSearched && (
          <>
            <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-primary">
                  الغرف والشقق المتاحة
                </h2>
                <p className="text-sm text-gray-500 flex flex-wrap items-center gap-2 mt-1">
                  <CalendarRange size={14} className="text-gold" />
                  <span>
                    {formatDate(checkIn)} → {formatDate(checkOut)} ·{" "}
                    <span className="font-bold text-primary">
                      {nights} ليلة
                    </span>{" "}
                    · {guests} {guests === 1 ? "ضيف" : "ضيوف"}
                  </span>
                </p>
              </div>
              {data && !loading && (
                <div className="text-xs bg-gold-soft/40 text-primary border border-gold/30 rounded-full px-3 py-1 font-semibold self-start md:self-auto">
                  {data.results.length === 0
                    ? "لا نتائج"
                    : `${data.results.length} ${
                        data.results.length === 1 ? "خيار متاح" : "خيارات متاحة"
                      }`}
                </div>
              )}
            </div>

            {loading && <ResultsSkeleton />}

            {!loading && resultsError && (
              <div className="bg-red-50 border border-red-200 text-danger text-sm p-4 rounded-xl flex items-start gap-2">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>{resultsError}</div>
              </div>
            )}

            {!loading && !resultsError && data && data.results.length === 0 && (
              <EmptyState />
            )}

            {!loading &&
              !resultsError &&
              data &&
              data.results.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                  {data.results.map((r) => (
                    <RoomResultCard
                      key={r.unitTypeId}
                      r={r}
                      checkIn={checkIn}
                      checkOut={checkOut}
                      guests={guests}
                      nights={nights}
                    />
                  ))}
                </div>
              )}
          </>
        )}

        {!hasSearched && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-xl md:text-2xl font-bold text-primary">
                لماذا فندق المفرق؟
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                تجربة إقامة محلية أصيلة — قلب المفرق، خدمة عائلية، ضيافة
                عربية.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoCard
                title="موقع استراتيجي"
                body="على بُعد خطوات من مراكز المدينة والدوائر الحكومية، ومداخل مريحة للعائلات."
              />
              <InfoCard
                title="غرف وشقق متنوّعة"
                body="من الغرف الفردية الاقتصادية إلى الشقق العائلية الواسعة، لكل ميزانية خيار."
              />
              <InfoCard
                title="تواصل مباشر"
                body="واتساب، بريد إلكتروني، أو اتصال هاتفي — فريقنا جاهز قبل وأثناء وبعد إقامتك."
              />
            </div>
            <div className="text-center mt-8 text-xs text-gray-500">
              تحتاج مساعدة في اختيار الغرفة المناسبة؟{" "}
              <Link
                href="/landing#contact"
                className="text-primary font-semibold hover:underline"
              >
                راسلنا الآن
              </Link>
            </div>
          </>
        )}
      </section>
    </GuestShell>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookInner />
    </Suspense>
  );
}

function Highlight({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white/10 border border-white/15 rounded-xl backdrop-blur-sm">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-white/75 leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-xl border border-gold/20 p-5 shadow-sm hover:shadow-md transition">
      <h3 className="font-bold text-primary">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed mt-1.5">{body}</p>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse"
        >
          <div className="aspect-[16/9] bg-gray-200" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-2/3 bg-gray-200 rounded" />
            <div className="h-3 w-full bg-gray-200 rounded" />
            <div className="h-3 w-1/2 bg-gray-200 rounded" />
            <div className="h-8 w-full bg-gray-200 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-gold-soft/30 border border-gold/30 rounded-2xl p-8 text-center">
      <BedDouble size={32} className="mx-auto text-gold" />
      <h3 className="mt-3 text-lg font-bold text-primary">
        لا توجد غرف متاحة للتواريخ المحدّدة
      </h3>
      <p className="text-sm text-gray-600 mt-1">
        جرّب تواريخ مختلفة أو قلّل عدد الضيوف.
      </p>
    </div>
  );
}

function RoomResultCard({
  r,
  checkIn,
  checkOut,
  guests,
  nights,
}: {
  r: Result;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
}) {
  const photoUrl = publicPhotoUrl(
    "unit-type-photo",
    r.primaryPhotoId,
    r.primaryPhotoUrl,
  );
  const estimate =
    r.basePriceDaily && r.basePriceDaily > 0 ? r.basePriceDaily * nights : null;
  const q = new URLSearchParams({
    checkIn,
    checkOut,
    guests: String(guests),
  });

  return (
    <article className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition overflow-hidden flex flex-col">
      <div className="relative aspect-[16/9] bg-gold-soft/40">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={r.nameAr}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gold">
            <BedDouble size={40} />
          </div>
        )}
        <span className="absolute top-3 right-3 bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
          {r.availableCount} متاح
        </span>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <h3 className="font-bold text-primary text-lg">{r.nameAr}</h3>
          <p className="text-xs text-gray-500">{r.nameEn}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Users size={13} /> حتى {r.maxOccupancy} ضيوف
          </span>
          {r.sizeSqm && (
            <span className="flex items-center gap-1">
              <Maximize size={13} /> {r.sizeSqm} م²
            </span>
          )}
          {r.hasKitchen && (
            <span className="flex items-center gap-1">
              <Utensils size={13} /> مطبخ
            </span>
          )}
          {r.hasBalcony && (
            <span className="flex items-center gap-1">
              <Sun size={13} /> شرفة
            </span>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between pt-2 border-t border-gray-100">
          <div>
            {r.basePriceDaily && r.basePriceDaily > 0 ? (
              <>
                <p className="text-xs text-gray-500">ابتداءً من</p>
                <p className="text-lg font-extrabold text-primary">
                  {r.basePriceDaily.toFixed(2)}{" "}
                  <span className="text-xs font-normal">د.أ/ليلة</span>
                </p>
                {estimate && (
                  <p className="text-[11px] text-gray-500">
                    ~ {estimate.toFixed(2)} د.أ لـ{nights} ليالٍ
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">السعر حسب الموسم</p>
            )}
          </div>
          <Link
            href={`/book/type/${r.unitTypeId}?${q.toString()}`}
            className="px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-primary-dark shadow-sm transition"
          >
            اختر واحجز
          </Link>
        </div>
      </div>
    </article>
  );
}
