"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GuestShell } from "@/components/public/GuestShell";
import { useSession } from "next-auth/react";

interface ReservationItem {
  id: number;
  status: string;
  confirmationCode: string | null;
  guestName: string;
  checkIn: string;
  checkOut: string;
  numNights: number;
  numGuests: number;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  unit: {
    id: number;
    unitNumber: string;
    unitTypeRef: { id: number; nameAr: string; nameEn: string } | null;
  };
}

export default function AccountPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<{
    upcoming: ReservationItem[];
    past: ReservationItem[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch("/api/guest-me/reservations")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <GuestShell active="account" lightHeader>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary">
              أهلاً {session?.user?.name?.split(" ")[0] ?? ""}
            </h1>
            <p className="text-sm text-gray-500">
              إليك نظرة سريعة على حجوزاتك القادمة والسابقة.
            </p>
          </div>
          <Link
            href="/book"
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md"
          >
            حجز جديد
          </Link>
        </div>

        <nav className="flex items-center gap-2 mb-6 text-sm">
          <Link
            href="/account"
            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary font-semibold"
          >
            حجوزاتي
          </Link>
          <Link
            href="/account/profile"
            className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            ملفي
          </Link>
          <Link
            href="/account/security"
            className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            الأمان
          </Link>
        </nav>

        <Section
          title="الحجوزات القادمة"
          items={data?.upcoming ?? []}
          empty="لا توجد حجوزات قادمة. ابدأ حجزاً جديداً من الزر أعلاه."
          loading={isLoading}
          variant="upcoming"
        />

        <div className="h-6" />

        <Section
          title="حجوزاتي السابقة"
          items={data?.past ?? []}
          empty="لم تقم بأي حجوزات سابقة بعد."
          loading={isLoading}
          variant="past"
        />
      </div>
    </GuestShell>
  );
}

function Section({
  title,
  items,
  empty,
  loading,
  variant,
}: {
  title: string;
  items: ReservationItem[];
  empty: string;
  loading: boolean;
  variant: "upcoming" | "past";
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-gray-800 mb-3">{title}</h2>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse h-32"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          {empty}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((r) => (
            <ReservationCard key={r.id} r={r} variant={variant} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReservationCard({
  r,
  variant,
}: {
  r: ReservationItem;
  variant: "upcoming" | "past";
}) {
  const typeName = r.unit.unitTypeRef?.nameAr ?? r.unit.unitNumber;
  const checkIn = new Date(r.checkIn);
  const checkOut = new Date(r.checkOut);
  const fmt = new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Link
      href={`/account/reservations/${r.id}`}
      className="block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-primary text-base truncate">
            {typeName}
          </p>
          <p className="text-xs text-gray-500">
            غرفة {r.unit.unitNumber} · {r.numNights} ليلة · {r.numGuests} ضيف
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="text-sm text-gray-700 mb-3">
        <span>{fmt.format(checkIn)}</span>
        <span className="mx-2 text-gray-400">→</span>
        <span>{fmt.format(checkOut)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-semibold text-primary">
          {r.totalAmount.toLocaleString("ar-EG")} د.أ
        </span>
        {r.confirmationCode && (
          <span className="font-mono" dir="ltr">
            {r.confirmationCode}
          </span>
        )}
      </div>
      {variant === "upcoming" && r.remaining > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-200 text-xs text-amber-700">
          المتبقّي للدفع عند الوصول:{" "}
          <span className="font-bold">
            {r.remaining.toLocaleString("ar-EG")} د.أ
          </span>
        </div>
      )}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    upcoming: {
      label: "قادم",
      classes: "bg-sky-50 text-sky-700 border-sky-200",
    },
    active: {
      label: "حالي",
      classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    completed: {
      label: "مكتمل",
      classes: "bg-gray-100 text-gray-600 border-gray-200",
    },
    cancelled: {
      label: "ملغى",
      classes: "bg-red-50 text-red-700 border-red-200",
    },
    pending_hold: {
      label: "قيد التأكيد",
      classes: "bg-amber-50 text-amber-700 border-amber-200",
    },
  };
  const { label, classes } = map[status] ?? {
    label: status,
    classes: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${classes}`}
    >
      {label}
    </span>
  );
}
