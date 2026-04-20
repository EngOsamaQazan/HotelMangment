import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/** GET /api/notifications/unread-count — small & cheap for the bell badge. */
export async function GET() {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const count = await prisma.notification.count({
      where: { userId, readAt: null },
    });
    return NextResponse.json({ count });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET unread-count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
