import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { registerPhoneNumber, isWhatsAppApiError } from "@/lib/whatsapp/client";

interface RegisterBody {
  pin?: string;
  dataLocalizationRegion?: string;
}

/**
 * POST /api/whatsapp/register — register the WhatsApp phone number for
 * Cloud API. Fixes error #133010 "Account not registered" that you get the
 * first time you try to send a message.
 *
 * Body: { pin: "123456" }
 *  - PIN is the Two-Step Verification code you set in Meta's WhatsApp Manager.
 *  - If the number was never protected by 2FA, pass any 6-digit PIN (Meta
 *    will set it).
 */
export async function POST(req: Request) {
  try {
    try {
      await requirePermission("settings.whatsapp:probe");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json().catch(() => ({}))) as RegisterBody;
    const pin = String(body.pin ?? "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN يجب أن يكون 6 أرقام." },
        { status: 400 },
      );
    }

    try {
      const result = await registerPhoneNumber({
        pin,
        dataLocalizationRegion: body.dataLocalizationRegion,
      });
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const apiErr = isWhatsAppApiError(err) ? err : null;
      const msg = apiErr?.message ?? (err as Error).message ?? "تعذّر التسجيل";
      return NextResponse.json(
        { error: msg, code: apiErr?.code, subcode: apiErr?.subcode },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    console.error("[POST /api/whatsapp/register]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر التسجيل" },
      { status: 500 },
    );
  }
}
