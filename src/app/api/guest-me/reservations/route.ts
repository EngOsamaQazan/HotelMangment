import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

/** GET /api/guest-me/reservations — lists the signed-in guest's bookings. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.audience !== "guest") {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const id = Number(session.user.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const now = new Date();
  const reservations = await prisma.reservation.findMany({
    where: {
      guestAccountId: id,
      status: { not: "pending_hold" },
    },
    orderBy: { checkIn: "desc" },
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
      totalAmount: true,
      paidAmount: true,
      remaining: true,
      createdAt: true,
      unit: {
        select: {
          id: true,
          unitNumber: true,
          unitTypeRef: {
            select: { id: true, nameAr: true, nameEn: true },
          },
        },
      },
    },
  });

  const upcoming = reservations.filter(
    (r) => new Date(r.checkOut) > now && r.status !== "cancelled",
  );
  const past = reservations.filter(
    (r) => !upcoming.includes(r),
  );

  return NextResponse.json({ upcoming, past });
}
