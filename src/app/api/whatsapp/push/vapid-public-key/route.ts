import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { getVapidPublicKey } from "@/lib/whatsapp/push-server";

/** GET /api/whatsapp/push/vapid-public-key
 *  Returns the VAPID public key the browser needs before `pushManager.subscribe`.
 *  Gated on `whatsapp:receive_notifications` so random users cannot probe keys. */
export async function GET() {
  try {
    await requirePermission("whatsapp:receive_notifications");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json(
      { error: "VAPID not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ publicKey: key });
}
