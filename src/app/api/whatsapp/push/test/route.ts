import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { sendWebPushToUser } from "@/lib/whatsapp/push-server";

/** POST /api/whatsapp/push/test
 *  Sends a dummy push to the caller's own registered devices so the user
 *  can verify their browser permission + Service Worker are actually
 *  wired up. Used from /settings/whatsapp/notifications. */
export async function POST() {
  let session;
  try {
    session = await requirePermission("whatsapp:receive_notifications");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const userId = Number((session.user as { id?: string | number }).id);
  await sendWebPushToUser(userId, {
    title: "واتساب — اختبار الإشعارات",
    body: "تم التسجيل بنجاح. سترى الإشعارات هكذا عند وصول رسالة جديدة.",
    tag: `wa-test-${userId}`,
    url: "/whatsapp",
  });

  return NextResponse.json({ ok: true });
}
