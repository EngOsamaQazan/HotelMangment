"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GuestShell } from "@/components/public/GuestShell";
import {
  CheckCircle2,
  CalendarRange,
  Users,
  Hash,
  Download,
  MessageCircle,
  AlertTriangle,
  Loader2,
  Phone,
} from "lucide-react";

interface Voucher {
  reservationId: number;
  confirmationCode: string;
  status: string;
  source: string;
  guestName: string;
  guestPhone: string | null;
  nationality: string | null;
  checkIn: string;
  checkOut: string;
  numNights: number;
  numGuests: number;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  createdAt: string;
  unit: {
    number: string;
    typeNameAr: string | null;
    typeNameEn: string | null;
    category: string | null;
    heroPhoto: string | null;
  };
  hotel: { nameAr: string; nameEn: string };
}

function formatDate(d: string): string {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(d));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toICSDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    "00Z"
  );
}

export default function ConfirmationPage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code) return;
    fetch(`/api/book/voucher/${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "تعذّر جلب قسيمة الحجز.");
        }
        return (await res.json()) as Voucher;
      })
      .then((v) => setVoucher(v))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "خطأ غير متوقع."),
      )
      .finally(() => setLoading(false));
  }, [code]);

  function downloadIcs() {
    if (!voucher) return;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Al Mafraq Hotel//Booking//AR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${voucher.confirmationCode}@mafraqhotel`,
      `DTSTAMP:${toICSDate(new Date().toISOString())}`,
      `DTSTART:${toICSDate(voucher.checkIn)}`,
      `DTEND:${toICSDate(voucher.checkOut)}`,
      `SUMMARY:حجز فندق المفرق — ${voucher.unit.typeNameAr ?? ""}`,
      `DESCRIPTION:رمز الحجز ${voucher.confirmationCode} — ${voucher.numGuests} ضيوف`,
      "LOCATION:فندق المفرق — المفرق\\, الأردن",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fakher-${voucher.confirmationCode}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <GuestShell active="book" lightHeader>
      {loading && (
        <div className="max-w-2xl mx-auto text-center py-16">
          <Loader2 size={32} className="animate-spin mx-auto text-primary" />
          <p className="mt-3 text-sm text-gray-500">جارٍ تحميل قسيمة الحجز…</p>
        </div>
      )}

      {!loading && error && (
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertTriangle size={22} className="text-danger mt-1 shrink-0" />
          <div>
            <h2 className="font-bold text-danger">تعذّر عرض قسيمة الحجز</h2>
            <p className="text-sm text-gray-700 mt-1">{error}</p>
            <Link
              href="/account"
              className="inline-block mt-3 text-sm text-primary hover:underline font-semibold"
            >
              الذهاب إلى حجوزاتي
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && voucher && (
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full mb-3">
              <CheckCircle2 size={36} />
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-primary">
              تمّ تأكيد حجزك بنجاح
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              أرسلنا تأكيداً إلى واتساب على
              {voucher.guestPhone ? (
                <span className="mx-1 font-semibold" dir="ltr">
                  {voucher.guestPhone}
                </span>
              ) : (
                " رقمك المسجّل"
              )}
              .
            </p>
          </div>

          <article className="bg-white rounded-2xl border border-gold/30 shadow-lg overflow-hidden">
            <div className="relative h-40 md:h-52 bg-gold-soft/40">
              {voucher.unit.heroPhoto && (
                <Image
                  src={voucher.unit.heroPhoto}
                  alt={voucher.unit.typeNameAr ?? ""}
                  fill
                  sizes="100vw"
                  className="object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-3 right-3 left-3 text-white">
                <p className="text-xs opacity-80">{voucher.hotel.nameAr}</p>
                <h2 className="font-bold text-lg md:text-xl">
                  {voucher.unit.typeNameAr ?? "حجز"}
                </h2>
              </div>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <VoucherRow
                icon={<Hash size={15} />}
                label="رمز الحجز"
                value={voucher.confirmationCode}
                mono
              />
              <VoucherRow
                icon={<Users size={15} />}
                label="الضيوف"
                value={`${voucher.numGuests}`}
              />
              <VoucherRow
                icon={<CalendarRange size={15} />}
                label="الوصول"
                value={formatDate(voucher.checkIn)}
              />
              <VoucherRow
                icon={<CalendarRange size={15} />}
                label="المغادرة"
                value={formatDate(voucher.checkOut)}
              />
              <VoucherRow
                icon={<Users size={15} />}
                label="الاسم"
                value={voucher.guestName}
              />
              <VoucherRow
                icon={<Phone size={15} />}
                label="الهاتف"
                value={voucher.guestPhone ?? "—"}
                mono
              />
            </div>

            <div className="px-5 pb-5">
              <div className="bg-gold-soft/30 border border-gold/30 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">إجمالي الإقامة</p>
                  <p className="text-xl font-extrabold text-primary">
                    {voucher.totalAmount.toFixed(2)}{" "}
                    <span className="text-sm font-normal">د.أ</span>
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {voucher.numNights} ليلة · الدفع عند الوصول
                  </p>
                </div>
                <div className="text-center text-xs text-gray-500">
                  <p>حالة الحجز</p>
                  <p className="mt-1 inline-block bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2.5 py-1 rounded-full">
                    {voucher.status === "upcoming" ? "قادم" : voucher.status}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 pb-5 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={downloadIcs}
                className="flex-1 border border-primary text-primary py-2.5 rounded-lg font-semibold hover:bg-gold-soft/40 flex items-center justify-center gap-2 text-sm"
              >
                <CalendarRange size={16} /> إضافة إلى التقويم
              </button>
              <a
                href={`/book/voucher/${encodeURIComponent(voucher.confirmationCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 border border-primary text-primary py-2.5 rounded-lg font-semibold hover:bg-gold-soft/40 flex items-center justify-center gap-2 text-sm"
              >
                <Download size={16} /> قسيمة الحجز
              </a>
              <a
                href={`https://wa.me/962781099910?text=${encodeURIComponent(`مرحباً، لديّ حجز برمز ${voucher.confirmationCode}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg font-semibold hover:bg-emerald-700 flex items-center justify-center gap-2 text-sm shadow"
              >
                <MessageCircle size={16} /> تواصل واتساب
              </a>
            </div>
          </article>

          <div className="mt-6 text-center space-x-3 rtl:space-x-reverse">
            <Link
              href="/account"
              className="inline-block text-sm text-primary hover:underline font-semibold"
            >
              الذهاب إلى حجوزاتي
            </Link>
            <span className="text-gray-300">·</span>
            <Link
              href="/book"
              className="inline-block text-sm text-gray-500 hover:text-primary"
            >
              حجز آخر
            </Link>
          </div>
        </div>
      )}
    </GuestShell>
  );
}

function VoucherRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
      <p className="text-[11px] text-gray-500 flex items-center gap-1">
        <span className="text-gold">{icon}</span>
        {label}
      </p>
      <p
        className={
          "mt-0.5 font-semibold text-primary " + (mono ? "font-mono" : "")
        }
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </p>
    </div>
  );
}
