import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { isWhatsAppApiError } from "@/lib/whatsapp/client";
import { submitWarmWelcomeTemplate } from "@/lib/whatsapp/welcome-template-setup";

/**
 * POST /api/whatsapp/welcome-template/setup
 *
 * Submits the canonical "warm welcome + PDF" template to Meta in one
 * shot — generates a sample contract PDF, uploads it via Resumable
 * Upload, then registers the template (UTILITY category, DOCUMENT
 * header). On success the template enters Meta's review queue and
 * lands in /settings/whatsapp ▸ Templates as PENDING. Approval
 * usually takes < 1 hour for utility templates.
 *
 * Once the template is APPROVED the operator can rebind
 * `bookingConfirmationTemplate` to its name from the same screen, and
 * the auto-trigger collapses the previous 3-message flow into 2:
 *   1) ONE rich message with the warm body + PDF inline
 *   2) The optional Quranic / Sunnah follow-up
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
    const result = await submitWarmWelcomeTemplate();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[POST /api/whatsapp/welcome-template/setup]", err);
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error:
          apiErr?.message ??
          (err as Error).message ??
          "تعذّر إرسال قالب الترحيب الدافئ إلى Meta",
        code: apiErr?.code,
        subcode: apiErr?.subcode,
      },
      { status: apiErr?.status ?? 500 },
    );
  }
}
