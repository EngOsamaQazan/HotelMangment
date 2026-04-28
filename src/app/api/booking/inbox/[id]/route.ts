import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { triggerBookingConfirmationAsync } from "@/lib/whatsapp/auto-trigger";

/** PATCH — update status or assign mappedUnitId. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.booking:edit");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.mappedUnitId !== undefined) data.mappedUnitId = body.mappedUnitId;

    const updated = await prisma.bookingInboxReservation.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/booking/inbox/[id]:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/booking/inbox/[id]/import — convert inbox row into a local Reservation.
 * Not implemented here: accepts unitId, unitPrice and creates a reservation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.booking:edit");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const inbox = await prisma.bookingInboxReservation.findUnique({ where: { id } });
    if (!inbox) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    if (inbox.status === "imported") {
      return NextResponse.json({ error: "سبق استيرادها" }, { status: 400 });
    }

    const body = await request.json();
    const unitId = Number(body.unitId ?? inbox.mappedUnitId);
    if (!Number.isFinite(unitId)) {
      return NextResponse.json({ error: "يجب تحديد الوحدة المحلية" }, { status: 400 });
    }
    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) return NextResponse.json({ error: "الوحدة غير موجودة" }, { status: 400 });

    const nights = Math.max(
      1,
      Math.ceil(
        (inbox.checkOut.getTime() - inbox.checkIn.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
    const unitPrice = nights > 0 ? inbox.totalAmount / nights : inbox.totalAmount;

    const reservation = await prisma.$transaction(async (tx) => {
      const r = await tx.reservation.create({
        data: {
          unitId: unit.id,
          guestName: inbox.guestName,
          phone: inbox.guestPhone,
          numNights: nights,
          stayType: "daily",
          checkIn: inbox.checkIn,
          checkOut: inbox.checkOut,
          unitPrice,
          totalAmount: inbox.totalAmount,
          paidAmount: 0,
          remaining: inbox.totalAmount,
          numGuests: inbox.numGuests,
          status: "active",
          notes: `مستورد من Booking #${inbox.externalId}`,
        },
      });
      await tx.bookingInboxReservation.update({
        where: { id },
        data: {
          status: "imported",
          importedAt: new Date(),
          localReservationId: r.id,
          mappedUnitId: unit.id,
        },
      });
      return r;
    });

    triggerBookingConfirmationAsync(reservation.id);
    return NextResponse.json({ ok: true, reservationId: reservation.id });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/booking/inbox/[id]:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
