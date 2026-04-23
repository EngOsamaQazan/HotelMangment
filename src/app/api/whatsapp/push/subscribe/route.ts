import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
}

/** POST /api/whatsapp/push/subscribe
 *  Registers this browser as a push target for the signed-in user.
 *  Multiple devices per user are supported (different `endpoint`s). */
export async function POST(req: Request) {
  let session;
  try {
    session = await requirePermission("whatsapp:receive_notifications");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const body = (await req.json().catch(() => ({}))) as SubscribeBody;
  const endpoint = String(body.endpoint ?? "").trim();
  const p256dh = String(body.keys?.p256dh ?? "").trim();
  const auth = String(body.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint + keys required" },
      { status: 400 },
    );
  }

  const userId = Number((session.user as { id?: string | number }).id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const sub = await prisma.whatsAppPushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: body.userAgent?.slice(0, 500) ?? null,
    },
    update: {
      userId,
      p256dh,
      auth,
      userAgent: body.userAgent?.slice(0, 500) ?? null,
      lastSeenAt: new Date(),
    },
  });

  // Make sure a prefs row exists so the user is opted into notifications by default.
  await prisma.whatsAppNotificationPref.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  return NextResponse.json({ ok: true, id: sub.id });
}
