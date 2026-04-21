import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountingError, ACCOUNT_CODES, cashAccountCodeFromMethod } from "@/lib/accounting";
import { postExtensionEntries } from "@/lib/reservations/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * Extend an existing reservation by N additional nights (or weeks/months,
 * following the original stay type). Does NOT touch the reservation's
 * existing journal entries — the extra revenue (and any extra payment)
 * is posted as a separate extension entry, preserving the audit trail.
 *
 * Body:
 *   {
 *     additionalNights: number,           // required, >= 1
 *     additionalAmount?: number,          // optional, defaults to nights * unitPrice
 *     additionalPaid?: number,            // optional cash received at extension
 *     paymentMethod?: "cash" | "bank" | "transfer" | …
 *     note?: string,
 *   }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("reservations:edit");
    const { id } = await params;
    const reservationId = parseInt(id);
    if (Number.isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid reservation id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const additionalNights = Number(body.additionalNights);
    if (!Number.isFinite(additionalNights) || additionalNights <= 0) {
      return NextResponse.json(
        { error: "عدد الليالي الإضافية يجب أن يكون عدداً موجباً" },
        { status: 400 },
      );
    }

    const existing = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { unit: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }
    if (existing.status === "cancelled") {
      return NextResponse.json(
        { error: "لا يمكن تمديد حجز ملغي" },
        { status: 409 },
      );
    }
    // Allow extending a `completed` reservation only when check-out was today
    // (same calendar day). This covers the common "نسي الضيف وبعدين قرر يكمّل"
    // scenario. Older completed reservations stay immutable.
    const isCompletedToday = (() => {
      if (existing.status !== "completed") return false;
      const co = new Date(existing.checkOut);
      co.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return co.getTime() === today.getTime();
    })();
    if (existing.status === "completed" && !isCompletedToday) {
      return NextResponse.json(
        { error: "لا يمكن تمديد حجز منتهٍ إلا في نفس يوم انتهائه" },
        { status: 409 },
      );
    }

    const unitPrice = Number(existing.unitPrice);
    const defaultAddedAmount = Math.round(unitPrice * additionalNights * 100) / 100;
    const addedAmount = body.additionalAmount !== undefined
      ? Number(body.additionalAmount)
      : defaultAddedAmount;
    if (!Number.isFinite(addedAmount) || addedAmount < 0) {
      return NextResponse.json({ error: "المبلغ الإضافي غير صالح" }, { status: 400 });
    }

    const addedPaid = body.additionalPaid !== undefined
      ? Number(body.additionalPaid)
      : 0;
    if (!Number.isFinite(addedPaid) || addedPaid < 0) {
      return NextResponse.json({ error: "قيمة الدفعة غير صالحة" }, { status: 400 });
    }
    if (addedPaid > addedAmount + Number(existing.remaining)) {
      return NextResponse.json(
        { error: "قيمة الدفعة تتجاوز إجمالي المتبقي بعد التمديد" },
        { status: 400 },
      );
    }

    const paymentMethod: string | null =
      typeof body.paymentMethod === "string" && body.paymentMethod.length > 0
        ? body.paymentMethod
        : existing.paymentMethod;

    // Compute new check-out by adding time to the current check-out while
    // preserving the stored time-of-day component.
    const newCheckOut = new Date(existing.checkOut);
    const stayType = existing.stayType || "daily";
    if (stayType === "monthly") {
      newCheckOut.setMonth(newCheckOut.getMonth() + additionalNights);
    } else if (stayType === "weekly") {
      newCheckOut.setDate(newCheckOut.getDate() + additionalNights * 7);
    } else {
      newCheckOut.setDate(newCheckOut.getDate() + additionalNights);
    }

    // Refuse if the extended window collides with another booking on the
    // same unit. The new extension range is (existing.checkOut, newCheckOut].
    const conflict = await prisma.reservation.findFirst({
      where: {
        unitId: existing.unitId,
        id: { not: reservationId },
        status: { in: ["active", "upcoming"] },
        checkIn: { lt: newCheckOut },
        checkOut: { gt: existing.checkOut },
      },
      select: { id: true, guestName: true, checkIn: true, checkOut: true },
    });
    if (conflict) {
      return NextResponse.json(
        {
          error: `لا يمكن التمديد — الوحدة محجوزة من ${conflict.checkIn.toISOString().slice(0, 10)} لصالح (${conflict.guestName})`,
        },
        { status: 409 },
      );
    }

    const newNumNights = existing.numNights + additionalNights;
    const newTotal = Math.round((Number(existing.totalAmount) + addedAmount) * 100) / 100;
    const newPaid = Math.round((Number(existing.paidAmount) + addedPaid) * 100) / 100;
    const newRemaining = Math.round((newTotal - newPaid) * 100) / 100;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          numNights: newNumNights,
          checkOut: newCheckOut,
          totalAmount: newTotal,
          paidAmount: newPaid,
          remaining: newRemaining,
          // Re-activate a reservation that was auto-completed earlier today
          // (the guest effectively never left). Otherwise keep the current status.
          ...(isCompletedToday ? { status: "active" } : {}),
          ...(body.note
            ? {
                notes: existing.notes
                  ? `${existing.notes}\n— تمديد ${additionalNights} ليلة: ${body.note}`
                  : `تمديد ${additionalNights} ليلة: ${body.note}`,
              }
            : {}),
        },
      });

      // The sweeper may have flipped the unit to `maintenance` (or `available`)
      // after check-out. Re-opening the stay puts the unit back on `occupied`.
      if (isCompletedToday) {
        await tx.unit.update({
          where: { id: existing.unitId },
          data: { status: "occupied" },
        });
      }

      if (addedPaid > 0) {
        const cashCode = cashAccountCodeFromMethod(paymentMethod);
        await tx.transaction.create({
          data: {
            date: new Date(),
            description: `تمديد حجز #${reservationId} - ${existing.guestName} - ${existing.unit.unitNumber}`,
            reservationId,
            amount: addedPaid,
            type: "income",
            account: cashCode === ACCOUNT_CODES.BANK ? "bank" : "cash",
            bankRef: null,
          },
        });
      }

      await postExtensionEntries(tx, {
        reservationId,
        guestName: existing.guestName,
        guestIdNumber: existing.guestIdNumber,
        phone: existing.phone,
        unitNumber: existing.unit.unitNumber,
        addedAmount,
        addedPaid,
        paymentMethod,
      });

      return tx.reservation.findUnique({
        where: { id: reservationId },
        include: { unit: true, guests: true, transactions: { orderBy: { date: "desc" } } },
      });
    });

    return NextResponse.json({
      reservation: updated,
      extension: {
        additionalNights,
        addedAmount,
        addedPaid,
        newCheckOut: newCheckOut.toISOString(),
        newTotal,
        newPaid,
        newRemaining,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof AccountingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("POST /api/reservations/[id]/extend error:", error);
    return NextResponse.json(
      { error: "Failed to extend reservation" },
      { status: 500 },
    );
  }
}
