import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountingError } from "@/lib/accounting";
import { reverseExtensionEntries } from "@/lib/reservations/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { logStatusTransition } from "@/lib/reservations/statusLog";

/**
 * POST /api/reservations/[id]/extensions/[extId]/reverse   (manager-only)
 *
 * Undoes a single extension event. Used when the front-desk made a
 * clerical mistake (wrong nights, wrong price, extended the wrong
 * reservation, …). The reversal:
 *
 *   1. Restores the reservation to the snapshot captured before the
 *      extension (checkOut, numNights, total/paid/remaining, status).
 *   2. Voids the extension's journal entries — revenue + any extension
 *      payment — via contra entries. The raw `Transaction` row created
 *      at extension time is NOT deleted; instead an opposite one is
 *      posted so the cash book keeps a complete paper trail.
 *   3. Writes a `reverse_extend` audit log row with the mandatory reason.
 *
 * Rules:
 *   - Only the most-recent non-reversed extension can be reversed.
 *     Reversing must happen in LIFO order so we don't corrupt earlier
 *     "previous state" snapshots.
 *   - Reservation must not be `cancelled`.
 *   - A non-empty `reason` is mandatory (regulatory audit trail).
 *
 * Body: { reason: string (required) }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; extId: string }> },
) {
  try {
    const session = await requirePermission("reservations:reverse_extend");
    const actorUserId = Number((session.user as { id?: string | number }).id);

    const { id, extId } = await params;
    const reservationId = parseInt(id);
    const extensionId = parseInt(extId);
    if (Number.isNaN(reservationId) || Number.isNaN(extensionId)) {
      return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 500)
        : "";
    if (!reason) {
      return NextResponse.json(
        { error: "يرجى توضيح سبب عكس التمديد" },
        { status: 400 },
      );
    }

    const extension = await prisma.reservationExtension.findUnique({
      where: { id: extensionId },
      include: {
        reservation: {
          select: {
            id: true,
            unitId: true,
            status: true,
            checkOut: true,
            numNights: true,
            totalAmount: true,
            paidAmount: true,
          },
        },
      },
    });
    if (!extension || extension.reservationId !== reservationId) {
      return NextResponse.json(
        { error: "سجل التمديد غير موجود" },
        { status: 404 },
      );
    }
    if (extension.reversedAt) {
      return NextResponse.json(
        { error: "هذا التمديد معكوس مسبقاً" },
        { status: 409 },
      );
    }
    if (extension.reservation.status === "cancelled") {
      return NextResponse.json(
        { error: "لا يمكن عكس تمديد على حجز ملغي" },
        { status: 409 },
      );
    }

    // Must be the most recent non-reversed extension. Reversing out of
    // order would overwrite a later extension's "previous state" snapshot.
    const laterActive = await prisma.reservationExtension.findFirst({
      where: {
        reservationId,
        reversedAt: null,
        createdAt: { gt: extension.createdAt },
      },
      select: { id: true },
    });
    if (laterActive) {
      return NextResponse.json(
        {
          error:
            "يوجد تمديد أحدث على هذا الحجز — يجب عكسه أولاً قبل عكس التمديد الأقدم",
        },
        { status: 409 },
      );
    }

    // Refuse if reversing would push checkOut to a point that pre-dates
    // an already-recorded actual check-out (data integrity).
    const freshRes = extension.reservation;
    const rollbackCheckOut = extension.previousCheckOut;

    const updated = await prisma.$transaction(async (tx) => {
      // 1) Restore reservation fields.
      await tx.reservation.update({
        where: { id: reservationId },
        data: {
          checkOut: rollbackCheckOut,
          numNights: extension.previousNumNights,
          totalAmount: extension.previousTotalAmount,
          paidAmount: extension.previousPaidAmount,
          remaining:
            Math.round(
              (Number(extension.previousTotalAmount) -
                Number(extension.previousPaidAmount)) *
                100,
            ) / 100,
          // Restore the pre-extension status as long as we're not
          // overriding a later, stronger state (e.g. the stay has since
          // been cancelled — guarded above).
          status: extension.previousStatus,
        },
      });

      // 2) Reverse any cash-book entry we created during extend. We post
      //    an opposite Transaction row so daily reports balance out.
      if (Number(extension.addedPaid) > 0) {
        await tx.transaction.create({
          data: {
            date: new Date(),
            description: `عكس تمديد حجز #${reservationId} (EXT#${extension.id}) — ${reason}`,
            reservationId,
            amount: -Number(extension.addedPaid),
            type: "income",
            account: extension.paymentMethod === "bank" ? "bank" : "cash",
            bankRef: null,
          },
        });
      }

      // 3) Void the journal entries scoped to this exact extension.
      await reverseExtensionEntries(tx, {
        reservationId,
        extensionId: extension.id,
        reason: `عكس تمديد #${extension.id}: ${reason}`,
        voidedById: Number.isFinite(actorUserId) ? actorUserId : null,
      });

      // 4) Flag the extension row as reversed.
      await tx.reservationExtension.update({
        where: { id: extension.id },
        data: {
          reversedAt: new Date(),
          reversedById: Number.isFinite(actorUserId) ? actorUserId : null,
          reversalReason: reason,
        },
      });

      // 5) If restoring puts checkOut in the past AND status came back as
      //    "active", the sweeper will flip it back to `completed` on the
      //    next tick — that's fine, it mirrors reality.

      await logStatusTransition(tx, {
        reservationId,
        fromStatus: freshRes.status,
        toStatus: extension.previousStatus,
        action: "reverse_extend",
        reason: `عكس تمديد #${extension.id} (-${extension.additionalNights} ${
          extension.stayType === "monthly"
            ? "شهر"
            : extension.stayType === "weekly"
              ? "أسبوع"
              : "ليلة"
        }، مبلغ ${Number(extension.addedAmount).toFixed(2)}) — ${reason}`,
        actorUserId: Number.isFinite(actorUserId) ? actorUserId : null,
      });

      return tx.reservation.findUnique({
        where: { id: reservationId },
        include: {
          unit: true,
          guests: true,
          transactions: { orderBy: { date: "desc" } },
        },
      });
    });

    return NextResponse.json({
      reservation: updated,
      reversedExtensionId: extension.id,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof AccountingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error(
      "POST /api/reservations/[id]/extensions/[extId]/reverse error:",
      error,
    );
    return NextResponse.json(
      { error: "تعذّر عكس التمديد" },
      { status: 500 },
    );
  }
}
