"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GuestShell } from "@/components/public/GuestShell";
import { publicPhotoUrl } from "@/lib/public-image";
import {
  buildUnitTypeSlug,
  isCanonicalSlug,
  parseIdFromSlug,
} from "@/lib/booking/slug";
import {
  Users,
  BedDouble,
  Maximize,
  Utensils,
  Sun,
  Wind,
  Cigarette,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

interface Photo {
  id: number;
  url: string;
  captionAr: string | null;
  captionEn: string | null;
  isPrimary: boolean;
}
interface Amenity {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  category: string | null;
}
interface Bed {
  bedType: string;
  count: number;
  sleepsExtra?: boolean;
}
interface Room {
  id: number;
  nameAr: string | null;
  nameEn: string | null;
  kind: string;
  beds: Bed[];
}
interface UnitTypeDetail {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm: number | null;
  hasKitchen: boolean;
  hasBalcony: boolean;
  smokingAllowed: boolean;
  view: string | null;
  basePriceDaily: number | null;
  photos: Photo[];
  amenities: Amenity[];
  rooms: Room[];
}

interface Quote {
  unitTypeId: number;
  nights: number;
  subtotal: number;
  taxes: number;
  total: number;
  currency: "JOD";
  nightsBreakdown: { date: string; rate: number; seasonName?: string }[];
  unavailableReason:
    | null
    | "not_publicly_bookable"
    | "unit_type_not_found"
    | "invalid_dates"
    | "no_units";
}

function formatDate(d: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "short",
  }).format(new Date(d));
}

function bedLabel(bt: string): string {
  switch (bt) {
    case "single":
      return "سرير فردي";
    case "double":
      return "سرير مزدوج";
    case "queen":
      return "سرير كوين";
    case "king":
      return "سرير كينغ";
    case "bunk":
      return "سرير بطابقين";
    default:
      return bt;
  }
}

function DetailInner() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const unitTypeId = parseIdFromSlug(params.slug ?? "");
  const checkIn = search.get("checkIn") ?? "";
  const checkOut = search.get("checkOut") ?? "";
  const guests = Math.max(1, Number(search.get("guests") || 1));

  const [detail, setDetail] = useState<UnitTypeDetail | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!unitTypeId) {
      setError("الرابط غير صالح.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/book/unit-types/${unitTypeId}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "تعذّر تحميل البيانات.");
        }
        return (await res.json()) as UnitTypeDetail;
      })
      .then((d) => {
        setDetail(d);
        // Canonical-slug redirect: if the visitor landed on /book/type/12
        // (legacy shape) or a stale slug, rewrite the URL in place to the
        // descriptive form so copied links stay clean.
        if (params.slug && !isCanonicalSlug(params.slug, d.nameEn, d.code, d.id)) {
          const canonical = buildUnitTypeSlug(d.nameEn, d.code, d.id);
          const qs = search.toString();
          router.replace(
            qs ? `/book/type/${canonical}?${qs}` : `/book/type/${canonical}`,
            { scroll: false },
          );
        }
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "خطأ غير متوقع."),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitTypeId]);

  useEffect(() => {
    if (!checkIn || !checkOut || !unitTypeId) return;
    setQuoteLoading(true);
    fetch("/api/book/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unitTypeId, checkIn, checkOut, guests }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Quote;
      })
      .then((q) => setQuote(q))
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false));
  }, [unitTypeId, checkIn, checkOut, guests]);

  const q = useMemo(
    () =>
      new URLSearchParams({
        unitTypeId: String(unitTypeId ?? ""),
        checkIn,
        checkOut,
        guests: String(guests),
      }),
    [unitTypeId, checkIn, checkOut, guests],
  );

  const photoUrls = useMemo(() => {
    if (!detail) return [] as { src: string; caption: string }[];
    return detail.photos
      .map((p) => ({
        src: publicPhotoUrl("unit-type-photo", p.id, p.url),
        caption: p.captionAr || p.captionEn || detail.nameAr,
      }))
      .filter((x): x is { src: string; caption: string } => !!x.src);
  }, [detail]);

  function reserve() {
    if (!checkIn || !checkOut || !unitTypeId) {
      router.push("/book");
      return;
    }
    router.push(`/book/checkout?${q.toString()}`);
  }

  return (
    <GuestShell active="book" lightHeader>
      {loading && <DetailSkeleton />}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-danger text-sm p-4 rounded-xl flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}
      {!loading && !error && detail && (
        <>
          <div className="mb-4 text-xs text-gray-500 flex items-center gap-2">
            <Link
              href={
                checkIn && checkOut
                  ? `/book?${new URLSearchParams({ checkIn, checkOut, guests: String(guests) }).toString()}`
                  : "/book"
              }
              className="hover:text-primary"
            >
              حجز
            </Link>
            <span>/</span>
            <span className="text-primary font-medium">{detail.nameAr}</span>
          </div>

          <PhotoMosaic
            photos={photoUrls}
            onOpen={(i) => setLightboxIndex(i)}
          />

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <header>
                <p className="text-xs text-gold font-semibold tracking-wider uppercase">
                  {detail.category}
                </p>
                <h1 className="text-2xl md:text-3xl font-extrabold text-primary mt-1">
                  {detail.nameAr}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">{detail.nameEn}</p>
              </header>

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700 bg-gold-soft/30 border border-gold/20 rounded-xl px-4 py-3">
                <Spec
                  icon={<Users size={15} />}
                  label={`حتى ${detail.maxOccupancy} ضيوف`}
                />
                {detail.sizeSqm && (
                  <Spec
                    icon={<Maximize size={15} />}
                    label={`${detail.sizeSqm} م²`}
                  />
                )}
                {detail.hasKitchen && (
                  <Spec icon={<Utensils size={15} />} label="مطبخ" />
                )}
                {detail.hasBalcony && (
                  <Spec icon={<Sun size={15} />} label="شرفة" />
                )}
                {detail.view && (
                  <Spec icon={<Wind size={15} />} label={detail.view} />
                )}
                <Spec
                  icon={<Cigarette size={15} />}
                  label={
                    detail.smokingAllowed ? "التدخين مسموح" : "التدخين ممنوع"
                  }
                />
              </div>

              {detail.descriptionAr && (
                <section>
                  <h2 className="text-lg font-bold text-primary mb-2">
                    عن هذا النوع
                  </h2>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {detail.descriptionAr}
                  </p>
                </section>
              )}

              {detail.rooms.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
                    <BedDouble size={18} /> الغرف والأسرّة
                  </h2>
                  <ul className="space-y-2">
                    {detail.rooms.map((room, idx) => (
                      <li
                        key={room.id}
                        className="bg-white border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div className="text-sm">
                          <p className="font-semibold text-primary">
                            {room.nameAr ?? `غرفة ${idx + 1}`}
                          </p>
                          <p className="text-xs text-gray-500">
                            {room.beds
                              .map((b) => `${b.count}× ${bedLabel(b.bedType)}`)
                              .join(" · ") || "—"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {detail.amenities.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-primary mb-3">
                    المرافق والخدمات
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {detail.amenities.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 bg-white border border-gray-100 rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="text-gold">✓</span>
                        <span className="text-gray-700">{a.nameAr}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-6">
                <PriceSummaryCard
                  nameAr={detail.nameAr}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  guests={guests}
                  quote={quote}
                  quoteLoading={quoteLoading}
                  onReserve={reserve}
                />
              </div>
            </aside>
          </div>
        </>
      )}

      {lightboxIndex !== null && photoUrls.length > 0 && (
        <Lightbox
          photos={photoUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={(i) => setLightboxIndex(i)}
        />
      )}
    </GuestShell>
  );
}

export default function UnitTypeDetailPage() {
  return (
    <Suspense fallback={null}>
      <DetailInner />
    </Suspense>
  );
}

function Spec({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-primary font-medium">
      <span className="text-gold">{icon}</span>
      {label}
    </span>
  );
}

function PhotoMosaic({
  photos,
  onOpen,
}: {
  photos: { src: string; caption: string }[];
  onOpen: (i: number) => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="aspect-[16/7] bg-gold-soft/40 rounded-2xl flex items-center justify-center text-gold">
        <BedDouble size={48} />
      </div>
    );
  }
  const main = photos[0];
  const side = photos.slice(1, 5);
  return (
    <div className="grid grid-cols-4 gap-2 rounded-2xl overflow-hidden h-[280px] md:h-[420px]">
      <button
        type="button"
        onClick={() => onOpen(0)}
        className="relative col-span-4 md:col-span-2 md:row-span-2 bg-gold-soft/40 group"
        aria-label={`عرض: ${main.caption}`}
      >
        <Image
          src={main.src}
          alt={main.caption}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover group-hover:scale-105 transition"
          priority
        />
      </button>
      {side.map((p, i) => (
        <button
          key={p.src}
          type="button"
          onClick={() => onOpen(i + 1)}
          className="relative hidden md:block bg-gold-soft/40 group"
          aria-label={`عرض: ${p.caption}`}
        >
          <Image
            src={p.src}
            alt={p.caption}
            fill
            sizes="25vw"
            className="object-cover group-hover:scale-105 transition"
          />
          {i === 3 && photos.length > 5 && (
            <div className="absolute inset-0 bg-black/40 text-white flex items-center justify-center font-bold">
              +{photos.length - 5} صور
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function Lightbox({
  photos,
  index,
  onClose,
  onIndexChange,
}: {
  photos: { src: string; caption: string }[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft")
        onIndexChange((index + 1) % photos.length);
      else if (e.key === "ArrowRight")
        onIndexChange((index - 1 + photos.length) % photos.length);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, photos.length, onClose, onIndexChange]);

  const cur = photos[index];
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/40"
        aria-label="إغلاق"
      >
        <X size={24} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onIndexChange((index - 1 + photos.length) % photos.length);
        }}
        className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40"
        aria-label="السابق"
      >
        <ChevronRight size={28} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onIndexChange((index + 1) % photos.length);
        }}
        className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40"
        aria-label="التالي"
      >
        <ChevronLeft size={28} />
      </button>
      <div
        className="relative w-full max-w-5xl h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={cur.src}
          alt={cur.caption}
          fill
          sizes="90vw"
          className="object-contain"
          priority
        />
        <div className="absolute bottom-0 inset-x-0 text-center text-white/90 text-sm bg-black/40 py-2">
          {cur.caption}
          <span className="mx-2 text-white/50">·</span>
          <span dir="ltr" className="text-white/60">
            {index + 1} / {photos.length}
          </span>
        </div>
      </div>
    </div>
  );
}

function PriceSummaryCard({
  nameAr,
  checkIn,
  checkOut,
  guests,
  quote,
  quoteLoading,
  onReserve,
}: {
  nameAr: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  quote: Quote | null;
  quoteLoading: boolean;
  onReserve: () => void;
}) {
  const hasDates = Boolean(checkIn && checkOut);
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gold/30 p-5">
      <p className="text-xs text-gold font-semibold tracking-wider uppercase">
        ملخّص الحجز
      </p>
      <h3 className="font-bold text-primary mt-1">{nameAr}</h3>
      <div className="mt-3 text-sm text-gray-700 space-y-1.5">
        {hasDates ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">الوصول</span>
              <span className="font-semibold">{formatDate(checkIn)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">المغادرة</span>
              <span className="font-semibold">{formatDate(checkOut)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">الضيوف</span>
              <span className="font-semibold">{guests}</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">اختر التواريخ أولاً من صفحة البحث.</p>
        )}
      </div>

      {hasDates && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          {quoteLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> حساب السعر…
            </div>
          ) : quote && !quote.unavailableReason ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {quote.nights} ليلة
                </span>
                <span className="font-semibold">
                  {quote.subtotal.toFixed(2)} د.أ
                </span>
              </div>
              {quote.taxes > 0 && (
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>ضرائب ورسوم</span>
                  <span>{quote.taxes.toFixed(2)} د.أ</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-sm font-bold text-primary">الإجمالي</span>
                <span className="text-lg font-extrabold text-primary">
                  {quote.total.toFixed(2)}{" "}
                  <span className="text-xs font-normal">د.أ</span>
                </span>
              </div>
              {quote.nightsBreakdown.length > 0 && (
                <details className="text-xs text-gray-500 mt-1">
                  <summary className="cursor-pointer hover:text-primary">
                    تفصيل الأسعار لكل ليلة
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {quote.nightsBreakdown.map((n) => (
                      <li
                        key={n.date}
                        className="flex items-center justify-between"
                      >
                        <span>
                          {formatDate(n.date)}
                          {n.seasonName && (
                            <span className="text-[10px] text-gold mx-1">
                              · {n.seasonName}
                            </span>
                          )}
                        </span>
                        <span>{n.rate.toFixed(2)} د.أ</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <p className="text-xs text-danger">
              لا يمكن حساب السعر للتواريخ المحدّدة.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onReserve}
        disabled={!hasDates}
        className="mt-4 w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark shadow transition disabled:opacity-50"
      >
        احجز الآن
      </button>
      <p className="mt-3 text-[11px] text-gray-500 text-center leading-relaxed">
        بنقرك على "احجز الآن" أنت توافق على
        <Link href="/terms" className="text-primary hover:underline mx-1">
          شروط الحجز
        </Link>
        و
        <Link href="/privacy" className="text-primary hover:underline mx-1">
          سياسة الخصوصية
        </Link>
        .
      </p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-[280px] md:h-[420px] bg-gold-soft/30 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-8 w-1/2 bg-gray-200 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 rounded" />
          <div className="h-20 bg-gray-100 rounded-xl" />
          <div className="h-40 bg-gray-100 rounded-xl" />
        </div>
        <div className="h-80 bg-gold-soft/30 rounded-2xl" />
      </div>
    </div>
  );
}
