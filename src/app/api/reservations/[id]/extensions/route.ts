import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/reservations/[id]/extensions
 *
 * Returns the full extension history for a reservation (most-recent first),
 * so the detail page can render the "what was added when" timeline and
 * expose the "undo extension" action against the latest non-reversed row.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("reservations:view");
    const { id } = await params;
    const reservationId = parseInt(id);
    if (Number.isNaN(reservationId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const extensions = await prisma.reservationExtension.findMany({
      where: { reservationId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, avatarUrl: true } },
        reversedBy: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    return NextResponse.json({ extensions });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/reservations/[id]/extensions error:", error);
    return NextResponse.json(
      { error: "تعذّر جلب سجل التمديدات" },
      { status: 500 },
    );
  }
}
