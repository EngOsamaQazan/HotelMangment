import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  logStatusTransition,
  isTransitionAllowed,
} from "@/lib/reservations/statusLog";

/**
 * POST /api/reservations/[id]/checkin
 *
 * Front-desk confirms the guest has physically arrived. Transitions an
 * `upcoming` reservation to `active`, marks the unit as `occupied`, and
 * stamps `actualCheckInAt` + `checkedInById` for audit.
 *
 * Body (optional): { note?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("reservations:checkin");
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
      select: { id: true, status: true, unitId: true, checkIn: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    if (existing.status === "active" && existing.id) {
      return NextResponse.json(
        { error: "الضيف مُسجّل دخوله بالفعل" },
        { status: 409 },
      );
    }
    if (!isTransitionAllowed(existing.status, "check_in")) {
      return NextResponse.json(
        {
          error:
            "لا يمكن تسجيل دخول هذا الحجز — الحالة الحالية لا تسمح بذلك",
        },
        { status: 409 },
      );
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.reservation.update({
        where: { id: reservationId },
        data: {
          status: "active",
          actualCheckInAt: now,
          checkedInById: Number.isFinite(actorUserId) ? actorUserId : null,
          noShow: false,
          noShowAt: null,
        },
      });

      await tx.unit.update({
        where: { id: existing.unitId },
        data: { status: "occupied" },
      });

      await logStatusTransition(tx, {
        reservationId,
        fromStatus: existing.status,
        toStatus: "active",
        action: "check_in",
        reason: note,
        actorUserId: Number.isFinite(actorUserId) ? actorUserId : null,
      });

      return res;
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/reservations/[id]/checkin error:", error);
    return NextResponse.json(
      { error: "تعذّر تسجيل دخول الضيف" },
      { status: 500 },
    );
  }
}
