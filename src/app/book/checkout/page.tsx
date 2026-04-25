"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { formatPhoneDisplay } from "@/lib/phone";
import { UnifiedAuthGate } from "@/components/auth/UnifiedAuthGate";
import {
  Loader2,
  AlertTriangle,
  CalendarRange,
  Users,
  BedDouble,
  Clock3,
  CheckCircle2,
} from "lucide-react";

/**
 * `/book/checkout` — finalize a booking.
 *
 * Flow:
 *  1. Read {unitTypeId, checkIn, checkOut, guests} from the URL.
 *  2. Fetch a server-side quote (GET /api/book/quote).
 *  3. If the visitor is not a guest user, send them to /signin with a
 *     return URL back here (middleware public-prefix list allows us to
 *     land here before login).
 *  4. Otherwise create a hold (POST /api/book/hold), show a 15-minute
 *     countdown, collect optional notes, and call POST /api/book/confirm
 *     to finalize — then redirect to /book/confirm/<code>.
 */
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

interface TypeSummary {
  id: number;
  nameAr: string;
  nameEn: string;
  maxOccupancy: number;
}

function formatDate(d: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
}

/**
 * Key used to stash the in-flight booking selection while the guest signs
 * in or signs up. This keeps the /signin URL clean (just `?next=/book/checkout`
 * instead of a fully-percent-encoded payload) and survives a full page reload.
 */
const PENDING_CHECKOUT_KEY = "fakher:pendingCheckout";

interface PendingCheckout {
  unitTypeId?: number;
  mergeId?: number;
  checkIn: string;
  checkOut: string;
  guests: number;
}

function CheckoutInner() {
  const search = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const unitTypeIdRaw = Number(search.get("unitTypeId"));
  const mergeIdRaw = Number(search.get("mergeId"));
  const isMerge = Number.isFinite(mergeIdRaw) && mergeIdRaw > 0;
  const unitTypeId = isMerge ? 0 : unitTypeIdRaw;
  const mergeId = isMerge ? mergeIdRaw : 0;
  const checkIn = search.get("checkIn") ?? "";
  const checkOut = search.get("checkOut") ?? "";
  const guests = Math.max(1, Number(search.get("guests") || 1));

  const [quote, setQuote] = useState<Quote | null>(null);
  const [summary, setSummary] = useState<TypeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hydrating, setHydrating] = useState(false);

  const [notes, setNotes] = useState("");
  const [agreed, setAgreed] = useState(false);

  const [holdId, setHoldId] = useState<number | null>(null);
  const [holdExpires, setHoldExpires] = useState<Date | null>(null);
  const [holding, setHolding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const isGuest = session?.user?.audience === "guest";
  const guestNeedsPhone = isGuest && !session?.user?.phone;

  // Social-only signups have audience=guest but no phone yet. Send them to
  // /account/complete-profile, which links a phone via OTP and bounces them
  // back here automatically.
  useEffect(() => {
    if (!guestNeedsPhone) return;
    const target = `/account/complete-profile?next=${encodeURIComponent(
      "/book/checkout",
    )}`;
    router.replace(target);
  }, [guestNeedsPhone, router]);

  // When the URL lacks booking context (e.g. guest just came back from
  // /signin?next=/book/checkout), try to rehydrate it from the short-lived
  // sessionStorage entry we wrote before redirecting away.
  useEffect(() => {
    if ((unitTypeId || mergeId) && checkIn && checkOut) return;
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return;
    try {
      const ctx = JSON.parse(raw) as PendingCheckout;
      const hasTarget =
        (ctx.unitTypeId && Number.isFinite(ctx.unitTypeId)) ||
        (ctx.mergeId && Number.isFinite(ctx.mergeId));
      if (ctx && hasTarget && ctx.checkIn && ctx.checkOut) {
        setHydrating(true);
        const q = new URLSearchParams({
          checkIn: ctx.checkIn,
          checkOut: ctx.checkOut,
          guests: String(ctx.guests ?? 1),
        });
        if (ctx.mergeId) q.set("mergeId", String(ctx.mergeId));
        else if (ctx.unitTypeId) q.set("unitTypeId", String(ctx.unitTypeId));
        router.replace(`/book/checkout?${q.toString()}`, { scroll: false });
      }
    } catch {
      // ignore malformed stash
    }
    // intentionally run only once on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the URL has a full booking context, the sessionStorage stash has
  // done its job — clear it so it doesn't leak into later visits.
  useEffect(() => {
    if ((unitTypeId || mergeId) && checkIn && checkOut && typeof window !== "undefined") {
      window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
    }
  }, [unitTypeId, mergeId, checkIn, checkOut]);

  useEffect(() => {
    if ((!unitTypeId && !mergeId) || !checkIn || !checkOut) {
      if (hydrating) return;
      setError("بيانات الحجز غير مكتملة. يُرجى العودة إلى صفحة البحث.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const quoteBody = isMerge
          ? { mergeId, checkIn, checkOut, guests }
          : { unitTypeId, checkIn, checkOut, guests };
        const summaryUrl = isMerge
          ? `/api/book/merges/${mergeId}`
          : `/api/book/unit-types/${unitTypeId}`;
        const [qRes, tRes] = await Promise.all([
          fetch("/api/book/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(quoteBody),
          }),
          fetch(summaryUrl),
        ]);
        if (!qRes.ok) {
          const j = await qRes.json().catch(() => ({}));
          throw new Error(j.error ?? "تعذّر حساب السعر.");
        }
        const q = (await qRes.json()) as Quote;
        if (q.unavailableReason) {
          throw new Error(
            isMerge
              ? "الشقة المدمجة غير متاحة للتواريخ المحدّدة."
              : "نوع الوحدة غير متاح للتواريخ المحدّدة.",
          );
        }
        setQuote(q);
        if (tRes.ok) {
          const t = (await tRes.json()) as TypeSummary;
          setSummary({
            id: t.id ?? 0,
            nameAr: t.nameAr,
            nameEn: t.nameEn,
            maxOccupancy: t.maxOccupancy,
          });
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "خطأ غير متوقع.");
      } finally {
        setLoading(false);
      }
    })();
  }, [unitTypeId, mergeId, isMerge, checkIn, checkOut, guests, hydrating]);

  async function createHold() {
    if (!agreed) {
      setError("الرجاء الموافقة على الشروط أولاً.");
      return;
    }
    setError("");
    setHolding(true);
    try {
      const res = await fetch("/api/book/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isMerge ? { mergeId } : { unitTypeId }),
          checkIn,
          checkOut,
          guests,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "تعذّر حجز الغرفة مؤقتاً.");
      }
      setHoldId(json.holdId);
      setHoldExpires(new Date(json.expiresAt));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع.");
    } finally {
      setHolding(false);
    }
  }

  async function confirmBooking() {
    if (!holdId) return;
    setConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/book/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "تعذّر تأكيد الحجز.");
      }
      router.push(`/book/confirm/${encodeURIComponent(json.confirmationCode)}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع.");
      setConfirming(false);
    }
  }

  return (
    <GuestShell active="book" lightHeader>
      <div className="max-w-4xl mx-auto">
        <Stepper step={isGuest ? (holdId ? 3 : 2) : 1} />

        {loading && <CheckoutSkeleton />}

        {!loading && error && !holdId && (
          <div className="bg-red-50 border border-red-200 text-danger text-sm p-4 rounded-xl flex items-start gap-2 mb-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && quote && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 space-y-5">
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
                  <BedDouble size={18} /> تفاصيل الإقامة
                </h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Stat
                    icon={<CalendarRange size={14} />}
                    label="الوصول"
                    value={formatDate(checkIn)}
                  />
                  <Stat
                    icon={<CalendarRange size={14} />}
                    label="المغادرة"
                    value={formatDate(checkOut)}
                  />
                  <Stat
                    icon={<Clock3 size={14} />}
                    label="عدد الليالي"
                    value={`${quote.nights} ليلة`}
                  />
                  <Stat
                    icon={<Users size={14} />}
                    label="الضيوف"
                    value={String(guests)}
                  />
                </div>
                {summary && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs text-gray-500">نوع الوحدة</p>
                    <p className="font-semibold text-primary">
                      {summary.nameAr}
                      <span className="text-xs text-gray-500 mx-2">
                        {summary.nameEn}
                      </span>
                    </p>
                  </div>
                )}
              </section>

              {status === "loading" ? (
                <div className="bg-gold-soft/30 border border-gold/30 rounded-2xl p-5 flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 size={16} className="animate-spin" /> جارٍ التحقّق من الجلسة…
                </div>
              ) : !isGuest ? (
                <CheckoutAuthGate
                  pending={{
                    ...(isMerge ? { mergeId } : { unitTypeId }),
                    checkIn,
                    checkOut,
                    guests,
                  }}
                />
              ) : guestNeedsPhone ? (
                <div className="bg-gold-soft/30 border border-gold/30 rounded-2xl p-5 flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 size={16} className="animate-spin" /> جارٍ
                  استكمال بيانات حسابك…
                </div>
              ) : (
                <GuestDetails
                  session={session}
                  notes={notes}
                  setNotes={setNotes}
                  agreed={agreed}
                  setAgreed={setAgreed}
                  holdId={holdId}
                  holdExpires={holdExpires}
                  holding={holding}
                  confirming={confirming}
                  onHold={createHold}
                  onConfirm={confirmBooking}
                  onCancel={() => {
                    setHoldId(null);
                    setHoldExpires(null);
                  }}
                  error={error}
                />
              )}
            </div>

            <aside className="md:col-span-1">
              <div className="md:sticky md:top-6 bg-white rounded-2xl shadow-lg border border-gold/30 p-5">
                <p className="text-xs text-gold font-semibold tracking-wider uppercase">
                  ملخّص السعر
                </p>
                <div className="mt-3 text-sm space-y-1.5">
                  <div className="flex items-center justify-between text-gray-600">
                    <span>{quote.nights} ليلة</span>
                    <span>{quote.subtotal.toFixed(2)} د.أ</span>
                  </div>
                  {quote.taxes > 0 && (
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>ضرائب ورسوم</span>
                      <span>{quote.taxes.toFixed(2)} د.أ</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                    <span className="text-sm font-bold text-primary">
                      الإجمالي
                    </span>
                    <span className="text-lg font-extrabold text-primary">
                      {quote.total.toFixed(2)}{" "}
                      <span className="text-xs font-normal">د.أ</span>
                    </span>
                  </div>
                </div>

                <details className="mt-3 text-xs text-gray-500">
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

                <div className="mt-4 text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
                  <p>• الدفع عند الوصول إلى الفندق.</p>
                  <p>• يمكن الإلغاء المجاني حتى 48 ساعة قبل الوصول.</p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </GuestShell>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = [
    { id: 1, label: "تسجيل الدخول" },
    { id: 2, label: "المراجعة" },
    { id: 3, label: "التأكيد" },
  ];
  return (
    <ol className="flex items-center justify-between max-w-md mx-auto mb-6">
      {steps.map((s, i) => {
        const active = s.id <= step;
        return (
          <li key={s.id} className="flex items-center flex-1">
            <div
              className={
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold " +
                (active
                  ? "bg-primary text-white"
                  : "bg-gray-200 text-gray-500")
              }
            >
              {s.id}
            </div>
            <span
              className={
                "text-xs mx-2 " +
                (active ? "text-primary font-semibold" : "text-gray-500")
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={
                  "flex-1 h-0.5 " + (active ? "bg-primary" : "bg-gray-200")
                }
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-gold-soft/25 border border-gold/15">
      <p className="text-[11px] text-gray-500 flex items-center gap-1">
        <span className="text-gold">{icon}</span>
        {label}
      </p>
      <p className="font-semibold text-primary mt-0.5">{value}</p>
    </div>
  );
}

function CheckoutAuthGate({ pending }: { pending: PendingCheckout }) {
  // Stash the booking context so the social OAuth round-trip and the
  // /account/complete-profile detour can return here with just
  // `?next=/book/checkout` and rebuild the URL from sessionStorage.
  function stash() {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        PENDING_CHECKOUT_KEY,
        JSON.stringify(pending),
      );
    } catch {
      /* sessionStorage unavailable (e.g. private mode) → silently fall back */
    }
  }
  return (
    <UnifiedAuthGate
      next="/book/checkout"
      variant="checkout"
      socialEnabled={{
        google: process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "1",
        apple: process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === "1",
      }}
      beforeRedirect={stash}
    />
  );
}

function GuestDetails({
  session,
  notes,
  setNotes,
  agreed,
  setAgreed,
  holdId,
  holdExpires,
  holding,
  confirming,
  onHold,
  onConfirm,
  onCancel,
  error,
}: {
  session: ReturnType<typeof useSession>["data"];
  notes: string;
  setNotes: (v: string) => void;
  agreed: boolean;
  setAgreed: (v: boolean) => void;
  holdId: number | null;
  holdExpires: Date | null;
  holding: boolean;
  confirming: boolean;
  onHold: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  error: string;
}) {
  const user = session?.user;
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-primary mb-3 flex items-center gap-2">
          <Users size={18} /> بياناتك
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <InfoRow label="الاسم" value={user?.name ?? "—"} />
          <InfoRow
            label="الهاتف"
            value={user?.phone ? formatPhoneDisplay(user.phone) : "—"}
            dir="ltr"
          />
        </div>
        <p className="text-[11px] text-gray-500 mt-2">
          لتغيير بياناتك، افتح{" "}
          <Link
            href="/account/profile"
            className="text-primary hover:underline"
          >
            حسابي → ملفي الشخصي
          </Link>
          .
        </p>
      </div>

      <div>
        <label className="block text-sm font-bold text-primary mb-1">
          طلبات خاصة (اختياري)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={400}
          disabled={Boolean(holdId)}
          placeholder="مثلاً: وصول متأخر، سرير إضافي، طابق علوي، خلوّ من الروائح…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none disabled:bg-gray-50"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          نحاول تلبيتها قدر الإمكان، لكنها غير مضمونة.
        </p>
      </div>

      {!holdId ? (
        <>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-gray-700 leading-relaxed">
              قرأتُ ووافقتُ على{" "}
              <Link href="/terms" className="text-primary hover:underline">
                الشروط والأحكام
              </Link>{" "}
              و
              <Link href="/privacy" className="text-primary hover:underline">
                سياسة الخصوصية
              </Link>
              .
            </span>
          </label>

          {error && (
            <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={onHold}
            disabled={holding || !agreed}
            className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark shadow disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {holding && <Loader2 size={16} className="animate-spin" />}
            {holding ? "جارٍ تثبيت الحجز…" : "تثبيت الحجز لمدة 15 دقيقة"}
          </button>
          <p className="text-[11px] text-gray-500 text-center">
            سنحجز الغرفة لك مؤقتاً لتستطيع إتمام التأكيد دون فقدانها.
          </p>
        </>
      ) : (
        <>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2 text-sm text-emerald-800">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">تمّ تثبيت الحجز بنجاح</p>
              {holdExpires && <Countdown expiresAt={holdExpires} />}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              className="flex-1 bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark shadow disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {confirming && <Loader2 size={16} className="animate-spin" />}
              {confirming ? "جارٍ التأكيد…" : "تأكيد الحجز"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={confirming}
              className="px-4 py-3 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              إلغاء
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function InfoRow({
  label,
  value,
  dir,
}: {
  label: string;
  value: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="font-semibold text-primary" dir={dir}>
        {value}
      </p>
    </div>
  );
}

function Countdown({ expiresAt }: { expiresAt: Date }) {
  const [remaining, setRemaining] = useState(
    Math.max(0, expiresAt.getTime() - Date.now()),
  );
  useEffect(() => {
    const i = setInterval(() => {
      setRemaining(Math.max(0, expiresAt.getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(i);
  }, [expiresAt]);
  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);
  return (
    <p className="text-xs mt-0.5" dir="ltr">
      {remaining > 0 ? (
        <>
          ⏱ ينتهي الحجز المؤقّت خلال{" "}
          <span className="font-mono font-bold">
            {mm}:{String(ss).padStart(2, "0")}
          </span>
        </>
      ) : (
        "انتهى الحجز المؤقّت. الرجاء إعادة المحاولة."
      )}
    </p>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-pulse">
      <div className="md:col-span-2 space-y-4">
        <div className="h-32 bg-gray-100 rounded-2xl" />
        <div className="h-56 bg-gray-100 rounded-2xl" />
      </div>
      <div className="h-72 bg-gold-soft/30 rounded-2xl" />
    </div>
  );
}
