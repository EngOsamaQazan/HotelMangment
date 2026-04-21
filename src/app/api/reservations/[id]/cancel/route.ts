import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AccountingError } from "@/lib/accounting";
import { reverseReservationEntries } from "@/lib/reservations/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  logStatusTransition,
  isTransitionAllowed,
} from "@/lib/reservations/statusLog";

/**
 * POST /api/reservations/[id]/cancel
 *
 * Cancels an `upcoming` or (rarely) `active` reservation. Reverses the
 * reservation's posted journal entries via `reverseReservationEntries`,
 * so the ledger stays balanced and auditable. If the cancelled reservation
 * was already `active`, the unit is moved to `maintenance` (same policy as
 * DELETE — housekeeping must check it).
 *
 * Body: { reason: string (required), refundPolicy?: "full" | "partial" | "none" }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("reservations:cancel");
    const actorUserId = Number((session.user as { id?: string | number }).id);

    const { id } = await params;
    const reservationId = parseInt(id);
    if (Number.isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : "";
    if (!reason) {
      return NextResponse.json(
        { error: "يرجى توضيح سبب الإلغاء" },
        { status: 400 },
      );
    }

    const existing = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true, unitId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (!isTransitionAllowed(existing.status, "cancel")) {
      return NextResponse.json(
        {
          error:
            "لا يمكن إلغاء هذا الحجز في حالته الحالية — الحجوزات المنتهية أو الملغاة سابقاً لا تُلغى مرة أخرى",
        },
        { status: 409 },
      );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      // Reverse ledger entries first — if anything goes wrong here (e.g.
      // a closed fiscal period), we want the whole cancellation to fail.
      await reverseReservationEntries(
        tx,
        reservationId,
        `إلغاء الحجز #${reservationId} — ${reason}`,
      );

      const res = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "cancelled",
          cancelledAt: now,
          cancelledById: Number.isFinite(actorUserId) ? actorUserId : null,
          cancellationReason: reason,
        },
      });

      // Unit transitions:
      //   - was `active`  → go to maintenance (needs cleaning)
      //   - was `upcoming` (unit likely `available` or already occupied by
      //     someone else) → don't touch it
      if (existing.status === "active") {
        const otherActive = await tx.reservation.count({
          where: {
            unitId: existing.unitId,
            status: "active",
            id: { not: reservationId },
          },
        });
        if (otherActive === 0) {
          await tx.unit.update({
            where: { id: existing.unitId },
            data: { status: "maintenance" },
          });
        }
      }

      await logStatusTransition(tx, {
        reservationId,
        fromStatus: existing.status,
        toStatus: "cancelled",
        action: "cancel",
        reason,
        actorUserId: Number.isFinite(actorUserId) ? actorUserId : null,
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof AccountingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("POST /api/reservations/[id]/cancel error:", error);
    return NextResponse.json(
      { error: "تعذّر إلغاء الحجز" },
      { status: 500 },
    );
  }
}
