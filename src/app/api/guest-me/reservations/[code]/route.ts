import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Build a Prisma `where` clause that resolves the URL segment — which is
 * a `confirmationCode` in canonical URLs but may also be a numeric id in
 * legacy bookmarks — into a single reservation owned by the signed-in
 * guest. Returns `null` when the segment is obviously malformed.
 */
function buildReservationWhere(
  segment: string,
  guestAccountId: number,
): Prisma.ReservationWhereInput | null {
  const raw = (segment ?? "").trim();
  if (!raw || raw.length > 40) return null;
  const asId = Number(raw);
  if (/^\d+$/.test(raw) && Number.isFinite(asId) && asId > 0) {
    return {
      guestAccountId,
      OR: [{ id: asId }, { confirmationCode: raw }],
    };
  }
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(raw)) return null;
  return { guestAccountId, confirmationCode: raw };
}

/**
 * GET /api/guest-me/reservations/[code]
 *
 * Looks up a reservation by its public confirmation code (the one we
 * display on the voucher / in the confirmation email). Falls back to
 * numeric ids so any bookmarks from before the URL redesign keep
 * working. Always scopes the lookup to the signed-in guest, so one
 * guest can never enumerate another's reservations.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.audience !== "guest") {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const guestAccountId = Number(session.user.id);
  const { code: codeParam } = await ctx.params;
  const where = buildReservationWhere(codeParam, guestAccountId);
  if (!where) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const reservation = await prisma.reservation.findFirst({
    where,
    select: {
      id: true,
      status: true,
      source: true,
      confirmationCode: true,
      guestName: true,
      phone: true,
      checkIn: true,
      checkOut: true,
      numNights: true,
      numGuests: true,
      unitPrice: true,
      totalAmount: true,
      paidAmount: true,
      remaining: true,
      holdExpiresAt: true,
      createdAt: true,
      notes: true,
      unit: {
        select: {
          unitNumber: true,
          unitTypeRef: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              category: true,
              photos: {
                orderBy: [
                  { isPrimary: "desc" },
                  { sortOrder: "asc" },
                ],
                select: { url: true, captionAr: true, captionEn: true },
              },
            },
          },
        },
      },
    },
  });
  if (!reservation) {
    return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });
  }
  return NextResponse.json(reservation);
}

/**
 * DELETE /api/guest-me/reservations/[code] — guest-initiated cancellation.
 * Allowed only for `upcoming` or `pending_hold` stays where check-in is
 * still in the future. Active/completed stays cannot be self-cancelled.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.audience !== "guest") {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const guestAccountId = Number(session.user.id);
  const { code: codeParam } = await ctx.params;
  const where = buildReservationWhere(codeParam, guestAccountId);
  if (!where) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    reason?: string;
  };

  const reservation = await prisma.reservation.findFirst({
    where,
    select: {
      id: true,
      status: true,
      checkIn: true,
    },
  });
  if (!reservation) {
    return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });
  }
  const id = reservation.id;
  if (
    !(
      reservation.status === "upcoming" ||
      reservation.status === "pending_hold"
    )
  ) {
    return NextResponse.json(
      { error: "لا يمكن إلغاء هذا الحجز من حسابك. يرجى التواصل مع الفندق." },
      { status: 409 },
    );
  }
  if (reservation.checkIn <= new Date()) {
    return NextResponse.json(
      { error: "تاريخ الوصول قد حلّ — يرجى التواصل مع الاستقبال." },
      { status: 409 },
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.reservation.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: now,
        cancellationReason: (body.reason ?? "").trim() || "إلغاء من الضيف",
        holdExpiresAt: null,
      },
    }),
    prisma.reservationStatusLog.create({
      data: {
        reservationId: id,
        fromStatus: reservation.status,
        toStatus: "cancelled",
        action: "cancel",
        reason: "guest_self_cancel",
        at: now,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
