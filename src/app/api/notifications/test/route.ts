import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { sendBrandedPush } from "@/lib/push/server";
import { resolveDeliveryChannels } from "@/lib/notifications/preferences";

/**
 * POST /api/notifications/test
 *
 * Sends a "test" notification to the calling user — useful for verifying
 * the bell, sound, and Web Push end-to-end after the user has updated
 * their preferences. The notification is honest about what it would have
 * sent: if the user has muted `web_push` we don't push.
 */
export async function POST() {
  try {
    const session = await requirePermission("notifications:send_test");
    const userId = Number((session.user as { id?: string | number }).id);
    const code = "system.announcement";
    const channels = await resolveDeliveryChannels(userId, code);

    const title = "إشعار تجريبي";
    const body = "هذا إشعار اختباري للتأكد من عمل قنوات الإشعارات.";

    const created = await prisma.notification.create({
      data: {
        userId,
        type: code,
        category: "system",
        title,
        body,
        linkUrl: "/notifications",
        priority: 0,
      },
    });

    if (channels.includes("web_push")) {
      await sendBrandedPush(userId, {
        module: "chat",
        title,
        body,
        url: "/notifications",
        tag: `test-${created.id}`,
      });
    }

    return NextResponse.json({
      ok: true,
      success: true,
      channels,
      notificationId: created.id,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/notifications/test error:", error);
    return NextResponse.json(
      { error: "فشل إرسال إشعار الاختبار" },
      { status: 500 },
    );
  }
}
