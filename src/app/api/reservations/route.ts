import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cashAccountCodeFromMethod, ACCOUNT_CODES } from "@/lib/accounting";
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
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status && status !== "all") {
      where.status = status;
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

    // Future booking? Keep the unit alone until the sweeper activates it.
    const isFutureBooking = checkInDate > now;
    const reservationStatus = isFutureBooking ? "upcoming" : "active";

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

      // Only flip the unit to occupied when the reservation is starting right
      // now. Future bookings leave the unit available and are activated by
      // the sweeper (see `src/lib/reservations/sweeper.ts`).
      if (!isFutureBooking) {
        await tx.unit.update({
          where: { id: unitId },
          data: { status: "occupied" },
        });
      }

      if (paid > 0) {
        const cashCode = cashAccountCodeFromMethod(paymentMethod);
        await tx.transaction.create({
          data: {
            date: new Date(),
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
    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}
