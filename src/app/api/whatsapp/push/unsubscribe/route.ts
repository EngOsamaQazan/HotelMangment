import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/** POST /api/whatsapp/push/unsubscribe
 *  Removes a browser's push subscription from the DB.
 *  Scoped to the current user — you cannot unsubscribe someone else. */
export async function POST(req: Request) {
  let session;
  try {
    session = await requirePermission("whatsapp:receive_notifications");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const endpoint = String(body.endpoint ?? "").trim();
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const userId = Number((session.user as { id?: string | number }).id);
  await prisma.whatsAppPushSubscription.deleteMany({
    where: { endpoint, userId },
  });

  return NextResponse.json({ ok: true });
}
