import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * POST /api/notifications/[id]/snooze
 *   body: { until?: number; minutes?: number }
 *
 * Hides the notification from the bell + center until the given time.
 * Either pass an absolute Unix timestamp (`until` in seconds) or a relative
 * delay in minutes (`minutes`). Defaults to 60 minutes.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("notifications:snooze");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const notifId = Number(id);
    if (!Number.isFinite(notifId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      until?: number;
      minutes?: number;
    };

    let until: Date;
    if (typeof body.until === "number" && Number.isFinite(body.until)) {
      until = new Date(body.until * 1000);
    } else {
      const minutes =
        typeof body.minutes === "number" && Number.isFinite(body.minutes)
          ? Math.max(1, Math.min(60 * 24 * 30, body.minutes))
          : 60;
      until = new Date(Date.now() + minutes * 60_000);
    }

    if (until.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "وقت التأجيل في الماضي" },
        { status: 400 },
      );
    }

    const result = await prisma.notification.updateMany({
      where: { id: notifId, userId },
      data: { snoozedUntil: until },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, snoozedUntil: until.toISOString() });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/notifications/[id]/snooze error:", error);
    return NextResponse.json(
      { error: "فشل تأجيل الإشعار" },
      { status: 500 },
    );
  }
}
