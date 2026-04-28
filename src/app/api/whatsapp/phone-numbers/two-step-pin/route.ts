import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { setTwoStepPin, isWhatsAppApiError } from "@/lib/whatsapp/client";

/**
 * POST /api/whatsapp/phone-numbers/two-step-pin
 *
 * Body: { pin: "######" }
 *
 * Sets / replaces the WhatsApp Two-Step Verification PIN for the active
 * number. Used for the ongoing 2FA challenge that protects re-registration.
 */
export async function POST(request: Request) {
  try {
    await requirePermission("settings.whatsapp:edit");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { pin?: string };
    const pin = (body.pin ?? "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN يجب أن يكون 6 أرقام" },
        { status: 400 },
      );
    }
    await setTwoStepPin(pin);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر التعيين" },
      { status: apiErr?.status ?? 502 },
    );
  }
}
