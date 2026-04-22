import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/book/voucher/[code]
 *
 * Returns voucher JSON for a confirmed reservation. Intentionally public
 * (scoped by the random `confirmationCode`, which acts as a capability
 * token) so guests can share the voucher link without needing to sign in.
 * A future milestone (ux_polish) renders this as a PDF; for now we return
 * structured JSON that the confirmation page consumes directly.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    if (!code || code.length > 40) {
      return NextResponse.json({ error: "رمز غير صالح" }, { status: 400 });
    }

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
        source: true,
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
                  orderBy: [
                    { isPrimary: "desc" },
                    { sortOrder: "asc" },
                  ],
                  take: 1,
                  select: { id: true, url: true },
                },
              },
            },
          },
        },
      },
    });

    if (!reservation || !reservation.confirmationCode) {
      return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });
    }
    if (reservation.status === "pending_hold") {
      return NextResponse.json(
        { error: "الحجز لم يُؤكَّد بعد" },
        { status: 409 },
      );
    }

    return NextResponse.json({
      reservationId: reservation.id,
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      source: reservation.source,
      guestName: reservation.guestName,
      guestPhone: maskPhone(reservation.phone),
      nationality: reservation.nationality,
      checkIn: reservation.checkIn.toISOString(),
      checkOut: reservation.checkOut.toISOString(),
      numNights: reservation.numNights,
      numGuests: reservation.numGuests,
      totalAmount: reservation.totalAmount,
      paidAmount: reservation.paidAmount,
      remaining: reservation.remaining,
      createdAt: reservation.createdAt.toISOString(),
      unit: {
        number: reservation.unit.unitNumber,
        typeNameAr: reservation.unit.unitTypeRef?.nameAr ?? null,
        typeNameEn: reservation.unit.unitTypeRef?.nameEn ?? null,
        category: reservation.unit.unitTypeRef?.category ?? null,
        heroPhoto: resolveHeroUrl(
          reservation.unit.unitTypeRef?.photos?.[0],
        ),
      },
      hotel: {
        nameAr: "فندق المفرق",
        nameEn: "Al Mafraq Hotel",
      },
    });
  } catch (error) {
    console.error("GET /api/book/voucher/[code] error:", error);
    return NextResponse.json({ error: "تعذّر جلب قسيمة الحجز" }, { status: 500 });
  }
}

function resolveHeroUrl(
  p?: { id: number; url: string } | null,
): string | null {
  if (!p) return null;
  if (/^https?:\/\//i.test(p.url)) return p.url;
  return `/api/files/unit-type-photo/${p.id}`;
}

function maskPhone(p: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/\D+/g, "");
  if (d.length <= 4) return p;
  return `${"•".repeat(d.length - 4)}${d.slice(-4)}`;
}
