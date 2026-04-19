import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { voidEntry } from "@/lib/accounting";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservationId = parseInt(id);

    if (isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        unit: true,
        guests: { orderBy: { guestOrder: "asc" } },
        transactions: { orderBy: { date: "desc" } },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    return NextResponse.json(reservation);
  } catch (error) {
    console.error("GET /api/reservations/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservation" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservationId = parseInt(id);

    if (isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      guestName,
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
      status,
      guests,
    } = body;

    const reservation = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {};

      if (guestName !== undefined) updateData.guestName = guestName;
      if (phone !== undefined) updateData.phone = phone;
      if (numNights !== undefined) updateData.numNights = numNights;
      if (stayType !== undefined) updateData.stayType = stayType;
      if (checkIn !== undefined) updateData.checkIn = new Date(checkIn);
      if (checkOut !== undefined) updateData.checkOut = new Date(checkOut);
      if (unitPrice !== undefined) updateData.unitPrice = Number(unitPrice);
      if (totalAmount !== undefined) updateData.totalAmount = Number(totalAmount);
      if (paidAmount !== undefined) updateData.paidAmount = Number(paidAmount);
      if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
      if (numGuests !== undefined) updateData.numGuests = numGuests;
      if (notes !== undefined) updateData.notes = notes;
      if (status !== undefined) updateData.status = status;

      if (totalAmount !== undefined || paidAmount !== undefined) {
        const total = totalAmount !== undefined ? parseFloat(totalAmount) : Number(existing.totalAmount);
        const paid = paidAmount !== undefined ? parseFloat(paidAmount) : Number(existing.paidAmount);
        updateData.remaining = total - paid;
      }

      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: updateData,
      });

      if (status === "completed" || status === "cancelled") {
        await tx.unit.update({
          where: { id: existing.unitId },
          data: { status: "available" },
        });
      }

      if (guests && Array.isArray(guests)) {
        await tx.guest.deleteMany({ where: { reservationId } });
        if (guests.length > 0) {
          await tx.guest.createMany({
            data: guests.map((g: { fullName: string; idNumber: string; nationality?: string; notes?: string }, idx: number) => ({
              reservationId,
              guestOrder: idx + 1,
              fullName: g.fullName,
              idNumber: g.idNumber,
              nationality: g.nationality || "",
              notes: g.notes || null,
            })),
          });
        }
      }

      return tx.reservation.findUnique({
        where: { id: reservationId },
        include: { unit: true, guests: true },
      });
    });

    return NextResponse.json(reservation);
  } catch (error) {
    console.error("PUT /api/reservations/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update reservation" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservationId = parseInt(id);

    if (isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const entries = await tx.journalEntry.findMany({
        where: {
          OR: [
            { source: "reservation", sourceRefId: reservationId },
            { source: "payment", sourceRefId: reservationId },
          ],
          status: "posted",
        },
      });
      for (const e of entries) {
        await voidEntry(tx, e.id, `حذف الحجز #${reservationId}`);
      }

      await tx.guest.deleteMany({ where: { reservationId } });
      await tx.transaction.deleteMany({ where: { reservationId } });
      await tx.reservation.delete({ where: { id: reservationId } });

      if (reservation.status === "active") {
        const activeCount = await tx.reservation.count({
          where: { unitId: reservation.unitId, status: "active", id: { not: reservationId } },
        });
        if (activeCount === 0) {
          await tx.unit.update({
            where: { id: reservation.unitId },
            data: { status: "available" },
          });
        }
      }
    });

    return NextResponse.json({ message: "Reservation deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/reservations/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete reservation" },
      { status: 500 }
    );
  }
}
