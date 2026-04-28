import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { isWhatsAppApiError } from "@/lib/whatsapp/client";
import { submitIntroTemplate } from "@/lib/whatsapp/intro-template-setup";

/**
 * POST /api/whatsapp/intro-template/setup
 *
 * Submits the minimal one-line "intro" template to Meta. Its only job
 * is to OPEN the 24-hour customer-service window so the standalone
 * PDF + warm caption can follow with full preview & full text. Body
 * has no variables — none of the booking facts are duplicated here,
 * eliminating the redundant "Hello {name}, your booking…" message
 * the operator complained about.
 */
export async function POST() {
  try {
    await requirePermission("whatsapp:create_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const result = await submitIntroTemplate();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[POST /api/whatsapp/intro-template/setup]", err);
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error:
          apiErr?.message ??
          (err as Error).message ??
          "تعذّر إرسال قالب الافتتاح المختصر إلى Meta",
        code: apiErr?.code,
        subcode: apiErr?.subcode,
      },
      { status: apiErr?.status ?? 500 },
    );
  }
}
