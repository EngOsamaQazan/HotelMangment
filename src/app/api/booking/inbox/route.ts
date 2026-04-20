import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/** GET /api/booking/inbox — list inbox reservations with optional status filter. */
export async function GET(request: Request) {
  try {
    await requirePermission("settings.booking:view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "new";

    const rows = await prisma.bookingInboxReservation.findMany({
      where: status === "all" ? {} : { status },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(rows);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/booking/inbox:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
