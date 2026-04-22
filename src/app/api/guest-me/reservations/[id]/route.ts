import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/guest-me/reservations/[id]
 * Returns the full detail of a guest's own reservation — guards against
 * enumerating other guests by checking `guestAccountId`.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.audience !== "guest") {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const guestAccountId = Number(session.user.id);
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const reservation = await prisma.reservation.findFirst({
    where: { id, guestAccountId },
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
 * DELETE /api/guest-me/reservations/[id] — guest-initiated cancellation.
 * Allowed only for `upcoming` or `pending_hold` stays where check-in is
 * still in the future. Active/completed stays cannot be self-cancelled.
 */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.audience !== "guest") {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const guestAccountId = Number(session.user.id);
  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    reason?: string;
  };

  const reservation = await prisma.reservation.findFirst({
    where: { id, guestAccountId },
    select: {
      id: true,
      status: true,
      checkIn: true,
    },
  });
  if (!reservation) {
    return NextResponse.json({ error: "الحجز غير موجود" }, { status: 404 });
  }
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
