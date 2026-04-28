import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  getSubscribedApps,
  subscribeApp,
  unsubscribeApp,
  isWhatsAppApiError,
} from "@/lib/whatsapp/client";

/**
 * GET    /api/whatsapp/subscriptions — list apps subscribed to this WABA.
 * POST   /api/whatsapp/subscriptions — subscribe the current app.
 * DELETE /api/whatsapp/subscriptions — unsubscribe the current app.
 *
 * Without an active subscription Meta will not deliver inbound webhook
 * events to our `/api/whatsapp/webhook` endpoint, even if the callback URL
 * is configured. This is a frequent cause of "messages stuck" reports.
 */
export async function GET() {
  try {
    await requirePermission("settings.whatsapp:view");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }
  try {
    const apps = await getSubscribedApps();
    return NextResponse.json({ apps });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر التحميل" },
      { status: apiErr?.status ?? 502 },
    );
  }
}

export async function POST() {
  try {
    await requirePermission("settings.whatsapp:edit");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }
  try {
    await subscribeApp();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر الاشتراك" },
      { status: apiErr?.status ?? 502 },
    );
  }
}

export async function DELETE() {
  try {
    await requirePermission("settings.whatsapp:edit");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }
  try {
    await unsubscribeApp();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر إلغاء الاشتراك" },
      { status: apiErr?.status ?? 502 },
    );
  }
}
