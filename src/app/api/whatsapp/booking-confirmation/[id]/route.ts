import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { sendBookingConfirmation } from "@/lib/whatsapp/booking-confirmation";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_WELCOME_CAPTION,
  DEFAULT_FOLLOW_UP_TEXT,
} from "@/lib/whatsapp/auto-trigger";

/**
 * POST /api/whatsapp/booking-confirmation/:id
 *
 * Sends the booking-confirmation WhatsApp template to the guest of
 * reservation `:id`, optionally attaching a contract PDF.
 *
 * Two ways to deliver the PDF:
 *
 *  1. **multipart/form-data**:
 *       file=<binary PDF>
 *       templateName=<optional>
 *       templateLanguage=<optional>
 *       documentOnly=<"1" to skip the structured template>
 *
 *  2. **application/json**:
 *       {
 *         "pdfUrl": "https://...",        // public link
 *         "pdfMediaId": "...",            // pre-uploaded via /api/whatsapp/media/upload
 *         "pdfFileName": "contract.pdf",
 *         "templateName": "...",
 *         "templateLanguage": "ar",
 *         "documentOnly": false
 *       }
 *
 * Either way, a successful response looks like:
 *   { ok: true, templateMessageId, documentMessageId, filledVariables, warnings }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("whatsapp:send_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const { id } = await context.params;
  const reservationId = Number(id);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    return NextResponse.json(
      { error: `معرّف الحجز غير صالح: ${id}` },
      { status: 400 },
    );
  }

  const ct = request.headers.get("content-type") ?? "";

  let pdfBuffer: Buffer | undefined;
  let pdfFileName: string | undefined;
  let pdfUrl: string | undefined;
  let pdfMediaId: string | undefined;
  let templateName: string | undefined;
  let templateLanguage: string | undefined;
  let documentOnly = false;

  if (ct.includes("multipart/form-data")) {
    const form = await request.formData();
    const blob = form.get("file");
    if (blob instanceof Blob && blob.size > 0) {
      pdfBuffer = Buffer.from(await blob.arrayBuffer());
      pdfFileName =
        (blob instanceof File && blob.name) ||
        `booking-${reservationId}.pdf`;
    }
    templateName = (form.get("templateName") as string | null) ?? undefined;
    templateLanguage =
      (form.get("templateLanguage") as string | null) ?? undefined;
    documentOnly = form.get("documentOnly") === "1";
    pdfUrl = (form.get("pdfUrl") as string | null) ?? undefined;
    pdfMediaId = (form.get("pdfMediaId") as string | null) ?? undefined;
  } else {
    const j = (await request.json().catch(() => ({}))) as {
      pdfUrl?: string;
      pdfMediaId?: string;
      pdfFileName?: string;
      templateName?: string;
      templateLanguage?: string;
      documentOnly?: boolean;
    };
    pdfUrl = j.pdfUrl;
    pdfMediaId = j.pdfMediaId;
    pdfFileName = j.pdfFileName;
    templateName = j.templateName;
    templateLanguage = j.templateLanguage;
    documentOnly = !!j.documentOnly;
  }

  // Re-sends from the UI must match the auto-trigger behaviour: warm
  // welcome caption + optional Quranic follow-up. Pull the operator's
  // saved preferences and fall back to the same defaults the auto-trigger
  // uses, so a "Resend" click is always indistinguishable from an
  // automatic dispatch on reservation create.
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  const welcomeCaption =
    cfg?.bookingConfirmationCaption ?? DEFAULT_WELCOME_CAPTION;
  const followUpText = cfg?.bookingFollowUpEnabled
    ? (cfg.bookingFollowUpText ?? DEFAULT_FOLLOW_UP_TEXT)
    : null;
  const effectiveTemplateName =
    templateName ?? cfg?.bookingConfirmationTemplate ?? undefined;
  const effectiveTemplateLanguage =
    templateLanguage ?? cfg?.bookingConfirmationLanguage ?? undefined;

  try {
    const out = await sendBookingConfirmation({
      reservationId,
      pdfBuffer,
      pdfFileName,
      pdfUrl,
      pdfMediaId,
      templateName: effectiveTemplateName,
      templateLanguage: effectiveTemplateLanguage,
      documentOnly,
      welcomeCaption,
      followUpText,
    });
    return NextResponse.json(out);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "فشل إرسال تأكيد الحجز",
      },
      { status: 502 },
    );
  }
}
