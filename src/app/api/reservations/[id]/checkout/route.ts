import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  logStatusTransition,
  isTransitionAllowed,
} from "@/lib/reservations/statusLog";

/**
 * POST /api/reservations/[id]/checkout
 *
 * Front-desk confirms the guest has left the property. Transitions an
 * `active` reservation to `completed`, sets the unit to `maintenance`
 * (housekeeping needs to reset it before the next guest), and stamps
 * `actualCheckOutAt` + `checkedOutById` for audit.
 *
 * Body (optional): { note?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("reservations:checkout");
    const actorUserId = Number((session.user as { id?: string | number }).id);

    const { id } = await params;
    const reservationId = parseInt(id);
    if (Number.isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const note: string | null =
      typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

    const existing = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { id: true, status: true, unitId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (!isTransitionAllowed(existing.status, "check_out")) {
      return NextResponse.json(
        {
          error:
            "لا يمكن تسجيل مغادرة هذا الحجز — يجب أن يكون في حالة «ساري»",
        },
        { status: 409 },
      );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "completed",
          actualCheckOutAt: now,
          checkedOutById: Number.isFinite(actorUserId) ? actorUserId : null,
        },
      });

      // Unit goes to maintenance so housekeeping can clean & reset it,
      // unless another active reservation is already overlapping the unit.
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

      await logStatusTransition(tx, {
        reservationId,
        fromStatus: existing.status,
        toStatus: "completed",
        action: "check_out",
        reason: note,
        actorUserId: Number.isFinite(actorUserId) ? actorUserId : null,
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/reservations/[id]/checkout error:", error);
    return NextResponse.json(
      { error: "تعذّر تسجيل مغادرة الضيف" },
      { status: 500 },
    );
  }
}
