import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * POST /api/notifications/mark-read
 * body: { ids: number[] } | { all: true }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const body = await request.json().catch(() => ({}));
    const { ids, all } = body as { ids?: number[]; all?: boolean };
    if (all) {
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    if (Array.isArray(ids) && ids.length) {
      const uniq = ids.map(Number).filter(Number.isFinite);
      await prisma.notification.updateMany({
        where: { userId, id: { in: uniq }, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "لا توجد معرفات" }, { status: 400 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/notifications/mark-read error:", error);
    return NextResponse.json(
      { error: "فشل تحديث الإشعارات" },
      { status: 500 },
    );
  }
}
