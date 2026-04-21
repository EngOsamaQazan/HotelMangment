import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/reservations/[id]/status-log
 *
 * Returns the full audit trail of status transitions for a reservation,
 * newest first, with the actor's display name when available.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("reservations:view");
    const { id } = await params;
    const reservationId = parseInt(id);
    if (Number.isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const logs = await prisma.reservationStatusLog.findMany({
      where: { reservationId },
      orderBy: { at: "desc" },
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(logs);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/reservations/[id]/status-log error:", error);
    return NextResponse.json(
      { error: "Failed to load audit log" },
      { status: 500 },
    );
  }
}
