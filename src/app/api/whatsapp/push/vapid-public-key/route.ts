import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { getVapidPublicKey } from "@/lib/whatsapp/push-server";

/** GET /api/whatsapp/push/vapid-public-key
 *  Returns the VAPID public key the browser needs before `pushManager.subscribe`.
 *
 *  The VAPID *public* key is by design non-secret (it ends up in every push
 *  subscription payload). We only require `whatsapp:view` so anyone with
 *  inbox access can enable desktop notifications without needing a separate
 *  permission grant — matches the UX of Gmail, Slack, and Meta Business Suite. */
export async function GET() {
  try {
    await requirePermission("whatsapp:view");
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
