import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountingError } from "@/lib/accounting";
import {
  hasFinancialImpact,
  postReservationEntries,
  reverseReservationEntries,
} from "@/lib/reservations/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { maybeSweepLazy } from "@/lib/reservations/sweeper";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("reservations:view");
    await maybeSweepLazy();
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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
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
    await requirePermission("reservations:edit");
    const { id } = await params;
    const reservationId = parseInt(id);

    if (isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { unit: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      guestName,
      guestIdNumber,
      nationality,
      phone,
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

    // `numNights` is intentionally NOT accepted here. Adding nights must
    // go through POST /api/reservations/[id]/extend so the ledger gets a
    // separate extension entry instead of mutating the original booking.

    const needsLedgerRepost = hasFinancialImpact({
      existing: {
        guestName: existing.guestName,
        guestIdNumber: existing.guestIdNumber,
        phone: existing.phone,
        checkIn: existing.checkIn,
        totalAmount: existing.totalAmount,
        paidAmount: existing.paidAmount,
        paymentMethod: existing.paymentMethod,
      },
      incoming: {
        guestName,
        guestIdNumber,
        phone,
        checkIn,
        totalAmount,
        paidAmount,
        paymentMethod,
      },
    });

    const reservation = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = {};

      if (guestName !== undefined) updateData.guestName = guestName;
      if (guestIdNumber !== undefined) updateData.guestIdNumber = guestIdNumber || null;
      if (nationality !== undefined) updateData.nationality = nationality || null;
      if (phone !== undefined) updateData.phone = phone;
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

      // IFRS / IAS 8 compliant correction:
      // posted journal entries are immutable. When financially relevant
      // fields change we reverse the old entries (contra entries linked
      // via `reversalOfId`) and post fresh entries with the corrected
      // figures. This keeps a complete audit trail instead of silently
      // overwriting a posted ledger line.
      if (needsLedgerRepost) {
        await reverseReservationEntries(
          tx,
          reservationId,
          `تعديل الحجز #${reservationId}`,
        );
        await postReservationEntries(tx, {
          reservationId,
          guestName: updated.guestName,
          guestIdNumber: updated.guestIdNumber,
          phone: updated.phone,
          unitNumber: existing.unit.unitNumber,
          checkIn: updated.checkIn,
          totalAmount: Number(updated.totalAmount),
          paidAmount: Number(updated.paidAmount),
          paymentMethod: updated.paymentMethod,
        });
      }

      if (status === "completed" || status === "cancelled") {
        // If no other active reservation is using the unit, move it to
        // maintenance (so housekeeping can clean it). A manual `cancelled`
        // transition still goes through maintenance so the operator has a
        // clear signal the room needs checking.
        const otherActive = await tx.reservation.count({
          where: {
            unitId: existing.unitId,
            status: "active",
            id: { not: reservationId },
          },
        });
        if (otherActive === 0) {
          const nextStatus = status === "cancelled" ? "available" : "maintenance";
          await tx.unit.update({
            where: { id: existing.unitId },
            data: { status: nextStatus },
          });
        }
      }

      // Promoted from upcoming → active manually? Make sure the unit reflects it.
      if (status === "active" && existing.status === "upcoming") {
        await tx.unit.update({
          where: { id: existing.unitId },
          data: { status: "occupied" },
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
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof AccountingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
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
    await requirePermission("reservations:delete");
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
      await reverseReservationEntries(
        tx,
        reservationId,
        `حذف الحجز #${reservationId}`,
      );

      await tx.guest.deleteMany({ where: { reservationId } });
      await tx.transaction.deleteMany({ where: { reservationId } });
      await tx.reservation.delete({ where: { id: reservationId } });

      if (reservation.status === "active") {
        const activeCount = await tx.reservation.count({
          where: { unitId: reservation.unitId, status: "active", id: { not: reservationId } },
        });
        if (activeCount === 0) {
          // Deleting an in-flight reservation: the room was occupied until
          // just now — send it through maintenance so housekeeping can reset
          // it before the next guest.
          await tx.unit.update({
            where: { id: reservation.unitId },
            data: { status: "maintenance" },
          });
        }
      }
    });

    return NextResponse.json({ message: "Reservation deleted successfully" });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/reservations/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete reservation" },
      { status: 500 }
    );
  }
}
