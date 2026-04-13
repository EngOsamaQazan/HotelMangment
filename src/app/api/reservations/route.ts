import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
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
    console.error("GET /api/reservations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservations" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
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
          checkIn: new Date(checkIn),
          checkOut: new Date(checkOut),
          unitPrice: Number(unitPrice),
          totalAmount: Number(totalAmount),
          paidAmount: paid,
          remaining,
          paymentMethod: paymentMethod || null,
          numGuests: numGuests || 1,
          notes: notes || null,
          groupId: groupId || null,
          status: "active",
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

      await tx.unit.update({
        where: { id: unitId },
        data: { status: "occupied" },
      });

      if (paid > 0) {
        await tx.transaction.create({
          data: {
            date: new Date(),
            description: `حجز - ${guestName} - غرفة ${unit.unitNumber}`,
            reservationId: res.id,
            amount: paid,
            type: "income",
            account: paymentMethod === "bank" ? "bank" : "cash",
            bankRef: null,
          },
        });
      }

      return tx.reservation.findUnique({
        where: { id: res.id },
        include: { unit: true, guests: true },
      });
    });

    return NextResponse.json(reservation, { status: 201 });
  } catch (error) {
    console.error("POST /api/reservations error:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 }
    );
  }
}
