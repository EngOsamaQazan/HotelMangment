import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  logStatusTransition,
  isTransitionAllowed,
} from "@/lib/reservations/statusLog";

/**
 * POST /api/reservations/[id]/reopen   (manager-only)
 *
 * Reactivates a `completed` reservation — for example, when the guest
 * returns to the lobby minutes after checking out and wants to stay
 * another night, or when the check-out was recorded in error.
 *
 * Mandatory justification (`reason`). Writes an `reopen` audit row so
 * regulators can see exactly who re-opened what, when, and why.
 *
 * Does NOT extend the check-out date — if nights need to be added, the
 * front-desk should call `/extend` right after (or pre-flight the flow
 * from the UI). Unit status goes back to `occupied`.
 *
 * Body: { reason: string (required) }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("reservations:reopen");
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
        { error: "يرجى توضيح سبب إعادة الفتح" },
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

    if (!isTransitionAllowed(existing.status, "reopen")) {
      return NextResponse.json(
        { error: "إعادة الفتح متاحة فقط للحجوزات المنتهية" },
        { status: 409 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "active",
          actualCheckOutAt: null,
          checkedOutById: null,
        },
      });

      // Put the unit back to occupied unless another active reservation
      // already holds it (unlikely, but keeps us safe).
      await tx.unit.update({
        where: { id: existing.unitId },
        data: { status: "occupied" },
      });

      await logStatusTransition(tx, {
        reservationId,
        fromStatus: existing.status,
        toStatus: "active",
        action: "reopen",
        reason,
        actorUserId: Number.isFinite(actorUserId) ? actorUserId : null,
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/reservations/[id]/reopen error:", error);
    return NextResponse.json(
      { error: "تعذّر إعادة فتح الحجز" },
      { status: 500 },
    );
  }
}
