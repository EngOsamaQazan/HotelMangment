import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { publicPhotoUrl } from "@/lib/public-image";
import Image from "next/image";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "قسيمة الحجز | فندق المفرق",
  robots: { index: false, follow: false },
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
}

export default async function VoucherPrintPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code || code.length > 40) notFound();

  const reservation = await prisma.reservation.findUnique({
    where: { confirmationCode: code },
    select: {
      id: true,
      confirmationCode: true,
      guestName: true,
      phone: true,
      nationality: true,
      checkIn: true,
      checkOut: true,
      numNights: true,
      numGuests: true,
      totalAmount: true,
      paidAmount: true,
      remaining: true,
      status: true,
      notes: true,
      createdAt: true,
      unit: {
        select: {
          unitNumber: true,
          unitTypeRef: {
            select: {
              nameAr: true,
              nameEn: true,
              category: true,
              photos: {
                orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                take: 1,
                select: { id: true, url: true },
              },
            },
          },
        },
      },
    },
  });

  if (!reservation) notFound();

  const photo = reservation.unit?.unitTypeRef?.photos?.[0] ?? null;
  const heroPhoto = photo
    ? publicPhotoUrl("unit-type-photo", photo.id, photo.url)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto px-4">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <a
            href={`/book/confirm/${encodeURIComponent(code)}`}
            className="text-sm text-primary hover:underline"
          >
            ← العودة إلى صفحة التأكيد
          </a>
          <PrintButton />
        </div>

        <article className="bg-white rounded-2xl shadow-lg print:shadow-none overflow-hidden border border-gold/30 print:border-0">
          <header className="bg-primary text-white p-6 print:bg-primary">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold">قسيمة حجز</h1>
                <p className="text-sm opacity-80 mt-1">فندق المفرق — أفخم إقامة</p>
              </div>
              <div className="text-left">
                <p className="text-xs opacity-80">رمز التأكيد</p>
                <p
                  className="text-xl font-mono font-bold tracking-wider"
                  dir="ltr"
                >
                  {reservation.confirmationCode}
                </p>
              </div>
            </div>
          </header>

          {heroPhoto && (
            <div className="relative h-40 bg-gold-soft/40">
              <Image
                src={heroPhoto}
                alt={reservation.unit?.unitTypeRef?.nameAr ?? ""}
                fill
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
              />
            </div>
          )}

          <div className="p-6 space-y-4">
            <section>
              <h2 className="text-base font-bold text-primary mb-2">
                معلومات الضيف
              </h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Field label="الاسم" value={reservation.guestName} />
                <Field
                  label="الهاتف"
                  value={reservation.phone ?? "—"}
                  mono
                />
                <Field
                  label="الجنسية"
                  value={reservation.nationality ?? "—"}
                />
                <Field
                  label="عدد الضيوف"
                  value={`${reservation.numGuests}`}
                />
              </dl>
            </section>

            <div className="border-t border-dashed border-gray-200" />

            <section>
              <h2 className="text-base font-bold text-primary mb-2">
                تفاصيل الإقامة
              </h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Field
                  label="نوع الوحدة"
                  value={
                    reservation.unit?.unitTypeRef?.nameAr ?? "—"
                  }
                />
                <Field
                  label="رقم الوحدة"
                  value={reservation.unit?.unitNumber ?? "—"}
                  mono
                />
                <Field
                  label="تاريخ الوصول"
                  value={formatDate(reservation.checkIn)}
                />
                <Field
                  label="تاريخ المغادرة"
                  value={formatDate(reservation.checkOut)}
                />
                <Field
                  label="عدد الليالي"
                  value={`${reservation.numNights}`}
                />
                <Field
                  label="المصدر"
                  value="حجز مباشر عبر الموقع"
                />
              </dl>
            </section>

            <div className="border-t border-dashed border-gray-200" />

            <section>
              <h2 className="text-base font-bold text-primary mb-2">
                ملخّص الأسعار
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">الإجمالي</td>
                    <td className="py-1 text-left font-semibold">
                      {reservation.totalAmount.toFixed(2)} د.أ
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">المدفوع</td>
                    <td className="py-1 text-left">
                      {reservation.paidAmount.toFixed(2)} د.أ
                    </td>
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="pt-2 font-bold">المتبقّي (يُدفع عند الوصول)</td>
                    <td className="pt-2 text-left font-extrabold text-primary">
                      {reservation.remaining.toFixed(2)} د.أ
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            {reservation.notes && (
              <>
                <div className="border-t border-dashed border-gray-200" />
                <section>
                  <h2 className="text-base font-bold text-primary mb-1">
                    ملاحظات
                  </h2>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {reservation.notes}
                  </p>
                </section>
              </>
            )}

            <div className="border-t border-dashed border-gray-200" />

            <section className="text-xs text-gray-500 leading-6">
              <p>
                يُرجى إبراز هذه القسيمة عند الوصول. في حال الحاجة إلى تعديل
                الحجز أو الاستفسار، يرجى التواصل معنا على الرقم 962781099910+
                أو عبر واتساب.
              </p>
              <p className="mt-1">
                تاريخ الإصدار: {formatDate(reservation.createdAt)}
              </p>
            </section>
          </div>

          <footer className="bg-gold-soft/30 px-6 py-3 text-center text-[11px] text-gray-600">
            شكراً لاختياركم فندق المفرق — نتمنّى لكم إقامة مميّزة.
          </footer>
        </article>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd
        className={
          "font-semibold text-primary mt-0.5 " + (mono ? "font-mono" : "")
        }
        dir={mono ? "ltr" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}
