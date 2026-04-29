import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * PATCH /api/notifications/[id]
 *   body: { read?: boolean; archived?: boolean }
 *
 * Toggles the per-row state. We accept booleans rather than dates so the
 * client never has to think about timezones; the server stamps the date.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const notifId = Number(id);
    if (!Number.isFinite(notifId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      read?: boolean;
      archived?: boolean;
    };

    const data: Record<string, Date | null> = {};
    if (typeof body.read === "boolean") {
      data.readAt = body.read ? new Date() : null;
    }
    if (typeof body.archived === "boolean") {
      data.archivedAt = body.archived ? new Date() : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "لا تغييرات للحفظ" },
        { status: 400 },
      );
    }

    const result = await prisma.notification.updateMany({
      where: { id: notifId, userId },
      data,
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/notifications/[id] error:", error);
    return NextResponse.json(
      { error: "فشل تحديث الإشعار" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/notifications/[id] — hard delete (rarely needed; the UI
 * archives instead so the user can recover from the archive tab).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const notifId = Number(id);
    if (!Number.isFinite(notifId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }
    await prisma.notification.deleteMany({
      where: { id: notifId, userId },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/notifications/[id] error:", error);
    return NextResponse.json(
      { error: "فشل حذف الإشعار" },
      { status: 500 },
    );
  }
}
