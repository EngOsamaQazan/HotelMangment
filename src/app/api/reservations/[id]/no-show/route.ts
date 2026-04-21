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
 * POST /api/reservations/[id]/no-show
 *
 * The guest never showed up. Flags the reservation as `cancelled` with
 * `noShow = true`. By default the financial entries are reversed (hotels
 * typically keep a deposit and refund the rest — but that's a separate
 * charge). Pass `keepCharge: true` to preserve the revenue posting (e.g.
 * when a non-refundable deposit rule applies).
 *
 * Body: { reason?: string, keepCharge?: boolean }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("reservations:noshow");
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
        : "الضيف لم يحضر";
    const keepCharge = body?.keepCharge === true;

    const existing = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true, unitId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (!isTransitionAllowed(existing.status, "no_show")) {
      return NextResponse.json(
        {
          error:
            "لا يمكن تسجيل عدم الحضور — هذا الخيار متاح فقط للحجوزات القادمة التي لم يُسجّل دخولها",
        },
        { status: 409 },
      );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      if (!keepCharge) {
        await reverseReservationEntries(
          tx,
          reservationId,
          `عدم حضور — إلغاء قيود الحجز #${reservationId}`,
        );
      }

      const res = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "cancelled",
          noShow: true,
          noShowAt: now,
          cancelledAt: now,
          cancelledById: Number.isFinite(actorUserId) ? actorUserId : null,
          cancellationReason: reason,
        },
      });

      await logStatusTransition(tx, {
        reservationId,
        fromStatus: existing.status,
        toStatus: "cancelled",
        action: "no_show",
        reason: keepCharge ? `${reason} (تم إبقاء الرسم)` : reason,
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
    console.error("POST /api/reservations/[id]/no-show error:", error);
    return NextResponse.json(
      { error: "تعذّر تسجيل عدم الحضور" },
      { status: 500 },
    );
  }
}
