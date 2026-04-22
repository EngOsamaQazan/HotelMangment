"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GuestShell } from "@/components/public/GuestShell";

interface ReservationDetail {
  id: number;
  status: string;
  source: string;
  confirmationCode: string | null;
  guestName: string;
  phone: string | null;
  checkIn: string;
  checkOut: string;
  numNights: number;
  numGuests: number;
  unitPrice: number;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  notes: string | null;
  unit: {
    unitNumber: string;
    unitTypeRef: {
      id: number;
      nameAr: string;
      nameEn: string;
      category: string;
      photos: { url: string; captionAr: string | null }[];
    } | null;
  };
}

export default function ReservationDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    fetch(`/api/guest-me/reservations/${code}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? "تعذّر جلب الحجز");
        }
        return r.json();
      })
      .then(setReservation)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  async function handleCancel() {
    if (!confirm("هل أنت متأكد من إلغاء الحجز؟ لا يمكن التراجع عن هذه الخطوة."))
      return;
    setCancelling(true);
    setCancelError("");
    const res = await fetch(`/api/guest-me/reservations/${code}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "إلغاء من الضيف" }),
    });
    setCancelling(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setCancelError(j.error ?? "تعذّر إلغاء الحجز");
      return;
    }
    router.push("/account");
    router.refresh();
  }

  if (loading) {
    return (
      <GuestShell active="account" lightHeader>
        <div className="max-w-3xl mx-auto animate-pulse space-y-4">
          <div className="h-48 bg-gray-100 rounded-2xl" />
          <div className="h-32 bg-gray-100 rounded-2xl" />
        </div>
      </GuestShell>
    );
  }

  if (error || !reservation) {
    return (
      <GuestShell active="account" lightHeader>
        <div className="max-w-xl mx-auto text-center py-10">
          <p className="text-gray-600">{error ?? "الحجز غير موجود"}</p>
          <Link
            href="/account"
            className="inline-block mt-4 text-primary hover:underline"
          >
            العودة إلى حجوزاتي
          </Link>
        </div>
      </GuestShell>
    );
  }

  const heroPhoto = reservation.unit.unitTypeRef?.photos?.[0]?.url;
  const fmt = new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const checkIn = new Date(reservation.checkIn);
  const checkOut = new Date(reservation.checkOut);
  const cancellable =
    (reservation.status === "upcoming" ||
      reservation.status === "pending_hold") &&
    checkIn > new Date();

  return (
    <GuestShell active="account" lightHeader>
      <div className="max-w-3xl mx-auto">
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-4"
        >
          ← العودة إلى حجوزاتي
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {heroPhoto && (
            <div
              className="h-48 md:h-64 bg-cover bg-center"
              style={{
                backgroundImage: `url(${heroPhoto.startsWith("http") ? heroPhoto : `/api/files/unit-type-photo/${heroPhoto}`})`,
              }}
            />
          )}
          <div className="p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-primary">
                  {reservation.unit.unitTypeRef?.nameAr ??
                    `غرفة ${reservation.unit.unitNumber}`}
                </h1>
                <p className="text-sm text-gray-500">
                  غرفة رقم {reservation.unit.unitNumber}
                </p>
              </div>
              {reservation.confirmationCode && (
                <div className="text-right">
                  <p className="text-[11px] text-gray-500">رمز الحجز</p>
                  <p
                    className="font-mono font-bold text-primary text-sm"
                    dir="ltr"
                  >
                    {reservation.confirmationCode}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-dashed border-gray-200 py-4">
              <KV label="تاريخ الوصول" value={fmt.format(checkIn)} />
              <KV label="تاريخ المغادرة" value={fmt.format(checkOut)} />
              <KV
                label="عدد الليالي / الضيوف"
                value={`${reservation.numNights} / ${reservation.numGuests}`}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <KV
                label="المجموع"
                value={`${reservation.totalAmount.toLocaleString("ar-EG")} د.أ`}
              />
              <KV
                label="المدفوع"
                value={`${reservation.paidAmount.toLocaleString("ar-EG")} د.أ`}
              />
              <KV
                label="المتبقّي"
                value={`${reservation.remaining.toLocaleString("ar-EG")} د.أ`}
                emphasize
              />
            </div>

            {reservation.notes && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                <p className="font-semibold mb-1">ملاحظات:</p>
                <p>{reservation.notes}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {reservation.confirmationCode && (
                <Link
                  href={`/book/confirm/${reservation.confirmationCode}`}
                  className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark shadow-md"
                >
                  عرض القسيمة
                </Link>
              )}
              {cancellable && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-bold hover:bg-red-50 disabled:opacity-50"
                >
                  {cancelling ? "جارٍ الإلغاء…" : "إلغاء الحجز"}
                </button>
              )}
            </div>
            {cancelError && (
              <div className="bg-red-50 border border-red-200 text-danger text-sm p-3 rounded-lg">
                {cancelError}
              </div>
            )}
          </div>
        </div>
      </div>
    </GuestShell>
  );
}

function KV({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 mb-0.5">{label}</p>
      <p
        className={
          emphasize
            ? "font-bold text-primary"
            : "font-semibold text-gray-800"
        }
      >
        {value}
      </p>
    </div>
  );
}
