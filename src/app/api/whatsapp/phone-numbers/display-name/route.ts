import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requestDisplayNameChange, isWhatsAppApiError } from "@/lib/whatsapp/client";

/**
 * POST /api/whatsapp/phone-numbers/display-name
 *
 * Body: { newName: string }
 *
 * Submits a request to Meta to change the verified business display name.
 * Meta reviews the request asynchronously — current status appears in
 * `name_status` / `new_name_status` on the phone number detail.
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
    const body = (await request.json().catch(() => ({}))) as { newName?: string };
    const newName = (body.newName ?? "").trim();
    if (newName.length < 3 || newName.length > 30) {
      return NextResponse.json(
        { error: "اسم العرض: 3 إلى 30 حرفاً" },
        { status: 400 },
      );
    }
    await requestDisplayNameChange(newName);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر الإرسال" },
      { status: apiErr?.status ?? 502 },
    );
  }
}
