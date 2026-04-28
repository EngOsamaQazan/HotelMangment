import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  getPhoneNumberDetail,
  listPhoneNumbers,
  isWhatsAppApiError,
} from "@/lib/whatsapp/client";

/**
 * GET /api/whatsapp/phone-numbers
 *
 * Returns the full health snapshot for the active phone number AND every
 * other number under the same WABA. Useful when the business owns more
 * than one number (e.g. sales + support).
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
    const [active, all] = await Promise.all([
      getPhoneNumberDetail().catch((err) => ({ _error: (err as Error).message })),
      listPhoneNumbers().catch(() => []),
    ]);
    return NextResponse.json({ active, all });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر التحميل" },
      { status: apiErr?.status ?? 502 },
    );
  }
}
