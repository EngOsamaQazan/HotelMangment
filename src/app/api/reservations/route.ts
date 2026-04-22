import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cashAccountCodeFromMethod, ACCOUNT_CODES, AccountingError } from "@/lib/accounting";
import { postReservationEntries } from "@/lib/reservations/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { maybeSweepLazy } from "@/lib/reservations/sweeper";

export async function GET(request: Request) {
  try {
    await requirePermission("reservations:view");
    // Piggy-back lifecycle transitions on user reads so the list stays
    // fresh even without a running external cron.
    await maybeSweepLazy();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status && status !== "all") {
      where.status = status;
    } else {
      // Hide pending holds from the general staff list — they become real
      // bookings only after `POST /api/book/confirm`. Operations doesn't
      // want a list noisy with 15-minute placeholders.
      where.status = { not: "pending_hold" };
    }

    if (source && source !== "all") {
      where.source = source;
    }

    if (search) {
      where.OR = [
        { guestName: { contains: search } },
        { phone: { contains: search } },
        { unit: { unitNumber: { contains: search } } },
      ];
    }

    const [reservations, total] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          unit: true,
          guests: { orderBy: { guestOrder: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.reservation.count({ where }),
    ]);

    return NextResponse.json({ reservations, total, page, limit });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/reservations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("reservations:create");
    const body = await request.json();
    const {
      unitId,
      guestName,
      guestIdNumber,
      nationality,
      phone,
      numNights,
      stayType,
      checkIn,
      checkOut,
      unitPrice,
      totalAmount,
      paidAmount,
      paymentMethod,
      numGuests,
      notes,
      groupId,
      guests,
      bedSetupRequested,
    } = body;

    if (!unitId || !guestName || !checkIn || !checkOut || !unitPrice || !totalAmount) {
      return NextResponse.json(
        { error: "Missing required fields: unitId, guestName, checkIn, checkOut, unitPrice, totalAmount" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const now = new Date();

    if (
      Number.isNaN(checkInDate.getTime()) ||
      Number.isNaN(checkOutDate.getTime()) ||
      checkOutDate <= checkInDate
    ) {
      return NextResponse.json(
        { error: "تاريخ/وقت الدخول أو الخروج غير صالح" },
        { status: 400 },
      );
    }

    // Reject any overlap with another active/upcoming reservation on the same unit.
    // Two ranges overlap iff (A.start < B.end) AND (A.end > B.start).
    const conflict = await prisma.reservation.findFirst({
      where: {
        unitId,
        status: { in: ["active", "upcoming"] },
        checkIn: { lt: checkOutDate },
        checkOut: { gt: checkInDate },
      },
      select: { id: true, checkIn: true, checkOut: true, guestName: true },
    });
    if (conflict) {
      return NextResponse.json(
        {
          error: `تتعارض الفترة المطلوبة مع حجز آخر على نفس الوحدة (#${conflict.id} - ${conflict.guestName})`,
        },
        { status: 409 },
      );
    }

    // Decide the reservation's initial lifecycle state from the requested
    // window. Three mutually-exclusive cases:
    //   • checkIn in the future            → "upcoming"
    //   • checkIn now/past, checkOut future → "active"   (currently staying)
    //   • checkOut in the past             → "completed" (back-dated record)
    // The unit status and the accounting payment date both follow from this.
    let reservationStatus: "upcoming" | "active" | "completed";
    if (checkInDate > now) reservationStatus = "upcoming";
    else if (checkOutDate <= now) reservationStatus = "completed";
    else reservationStatus = "active";

    const isBackdated = checkInDate < now;
    // Cash was received on the day the guest actually paid. For normal/future
    // bookings that's today; for back-dated records it's the check-in date so
    // the payment entry lands in the same fiscal period as the revenue entry.
    const paymentDate = isBackdated ? checkInDate : now;

    const paid = parseFloat(paidAmount || "0");
    const total = parseFloat(totalAmount);
    const remaining = total - paid;

    const reservation = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.create({
        data: {
          unitId,
          guestName,
          guestIdNumber: guestIdNumber || null,
          nationality: nationality || null,
          phone: phone || null,
          numNights: numNights || 1,
          stayType: stayType || "daily",
          checkIn: checkInDate,
          checkOut: checkOutDate,
          unitPrice: Number(unitPrice),
          totalAmount: Number(totalAmount),
          paidAmount: paid,
          remaining,
          paymentMethod: paymentMethod || null,
          numGuests: numGuests || 1,
          notes: notes || null,
          groupId: groupId || null,
          bedSetupRequested: bedSetupRequested || null,
          status: reservationStatus,
          // For fully back-dated bookings the operational events (arrival
          // and departure) have already happened. Stamp the desk timestamps
          // with the scheduled dates so the record is historically complete
          // and the reservation detail page doesn't render empty slots.
          actualCheckInAt:
            reservationStatus === "completed" ? checkInDate : null,
          actualCheckOutAt:
            reservationStatus === "completed" ? checkOutDate : null,
        },
      });

      if (guests && Array.isArray(guests) && guests.length > 0) {
        await tx.guest.createMany({
          data: guests.map((g: { fullName: string; idNumber: string; nationality?: string; notes?: string }, idx: number) => ({
            reservationId: res.id,
            guestOrder: idx + 1,
            fullName: g.fullName,
            idNumber: g.idNumber,
            nationality: g.nationality || "",
            notes: g.notes || null,
          })),
        });
      }

      // Flip the unit to occupied only if the reservation is active right
      // now. `upcoming` leaves the unit free until the sweeper activates it;
      // `completed` (back-dated, fully in the past) must not touch the unit
      // at all because the guest has already left.
      if (reservationStatus === "active") {
        await tx.unit.update({
          where: { id: unitId },
          data: { status: "occupied" },
        });
      }

      if (paid > 0) {
        const cashCode = cashAccountCodeFromMethod(paymentMethod);
        await tx.transaction.create({
          data: {
            date: paymentDate,
            description: `حجز - ${guestName} - غرفة ${unit.unitNumber}`,
            reservationId: res.id,
            amount: paid,
            type: "income",
            account: cashCode === ACCOUNT_CODES.BANK ? "bank" : "cash",
            bankRef: null,
          },
        });
      }

      await postReservationEntries(tx, {
        reservationId: res.id,
        guestName,
        guestIdNumber: guestIdNumber || null,
        phone: phone || null,
        unitNumber: unit.unitNumber,
        checkIn: checkInDate,
        totalAmount: total,
        paidAmount: paid,
        paymentMethod: paymentMethod || null,
        paymentDate,
      });

      return tx.reservation.findUnique({
        where: { id: res.id },
        include: { unit: true, guests: true },
      });
    });

    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    // Closed-period / validation errors carry user-friendly Arabic messages;
    // bubble them up as 400 so the front-end error banner shows them directly
    // (typical case: back-dated reservation landing in a closed fiscal month).
    if (error instanceof AccountingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}
