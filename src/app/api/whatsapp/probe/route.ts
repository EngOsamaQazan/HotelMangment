import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { probePhoneNumber, isWhatsAppApiError } from "@/lib/whatsapp/client";
import { markVerification, updateConfig } from "@/lib/whatsapp/config";

/** POST /api/whatsapp/probe — "Test connection" button. */
export async function POST() {
  try {
    try {
      await requirePermission("settings.whatsapp:probe");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    try {
      const info = await probePhoneNumber();
      if (info.display_phone_number) {
        await updateConfig({ displayPhoneNumber: info.display_phone_number });
      }
      await markVerification(true);
      return NextResponse.json({ ok: true, info });
    } catch (err) {
      const apiErr = isWhatsAppApiError(err) ? err : null;
      const msg = apiErr?.message ?? (err as Error).message ?? "تعذّر الاتصال";
      await markVerification(false, msg);
      return NextResponse.json(
        { error: msg, code: apiErr?.code, subcode: apiErr?.subcode },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    console.error("[POST /api/whatsapp/probe]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر الاتصال" },
      { status: 500 },
    );
  }
}
