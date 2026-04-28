import "server-only";
import { prisma } from "@/lib/prisma";
import {
  sendTemplate,
  sendText,
  sendDocument,
  uploadPhoneMedia,
  isWhatsAppApiError,
} from "./client";
import {
  buildSendComponents,
  inspectTemplate,
} from "./template-helpers";
import { renderContractHtml } from "@/lib/contract/render-html";
import { htmlToPdf } from "@/lib/pdf/browser";
import { beginOutboundLog, finishOutboundLog } from "./log-outbound";

/**
 * Send the "booking confirmation" template for an existing reservation,
 * optionally accompanied by a PDF (contract / details). The function is
 * agnostic to the template's actual variable layout — it introspects
 * whatever is currently approved at Meta and supplies a sensible mapping
 * from reservation fields:
 *
 *   {{1}} → guest name
 *   {{2}} → check-in date (YYYY-MM-DD)
 *   {{3}} → check-out date (YYYY-MM-DD)
 *   {{4}} → reservation reference (confirmationCode || `RSV-<id>`)
 *   {{5}} → number of nights
 *   {{6}} → total amount
 *   {{7}} → remaining balance
 *
 * Only the variables present in the template are filled. Unknown variables
 * fall back to the example values the operator supplied at template-creation
 * time, then finally to a placeholder string — never an empty value (Meta
 * rejects empty body parameters).
 *
 * PDF handling:
 *   • If the template's header is DOCUMENT and the caller supplies a
 *     PDF (URL, Buffer, or pre-uploaded media_id), it is plugged into
 *     the header parameter and Meta delivers a single, rich message.
 *   • Otherwise (header is TEXT), the template is sent first, then a
 *     follow-up "document" message is dispatched inside the now-open
 *     24-hour window — user-perceived result is identical.
 */

export interface SendBookingConfirmationInput {
  reservationId: number;
  /** Optional PDF; one of these wins (priority: mediaId → pdfBuffer → pdfUrl).
   *  When NONE are provided the contract PDF is auto-generated from the
   *  reservation data using the same renderer the print-preview uses. */
  pdfMediaId?: string;
  pdfBuffer?: Buffer;
  pdfUrl?: string;
  /** Set to true to skip the contract auto-generation when no PDF is
   *  supplied — sends the bare template only. */
  skipContractPdf?: boolean;
  /** Override file name shown in WhatsApp clients (default: "حجزك_<id>.pdf"). */
  pdfFileName?: string;
  /** Override template name (default: "booking_confirmation_ar"). */
  templateName?: string;
  /** Override template language (default: read from local DB). */
  templateLanguage?: string;
  /** Skip the template entirely and just send the PDF as a stand-alone
   *  document message. Useful when the operator only wants to share
   *  the contract and not duplicate the structured confirmation. */
  documentOnly?: boolean;
  /** Free-text caption rendered as a follow-up text message right after
   *  the structured template. Supports {{1}}..{{N}} substitution from the
   *  same reservation facts (guest name, dates, amounts). */
  welcomeCaption?: string;
  /** Optional second message — sent as a free-text WhatsApp message right
   *  after the main confirmation succeeds (still inside the now-open
   *  24-hour customer-service window, so no extra template required).
   *  Typical use: tasteful Quranic / Sunnah blessing. Set to `null` or
   *  omit to skip the follow-up entirely. Supports `{{N}}` substitutions. */
  followUpText?: string | null;
}

export interface BookingConfirmationResult {
  ok: true;
  templateMessageId?: string;
  documentMessageId?: string;
  followUpMessageId?: string;
  filledVariables: number;
  warnings: string[];
}

export async function sendBookingConfirmation(
  args: SendBookingConfirmationInput,
): Promise<BookingConfirmationResult> {
  const warnings: string[] = [];

  const reservation = await prisma.reservation.findUnique({
    where: { id: args.reservationId },
    include: {
      unit: { include: { unitTypeRef: true } },
      guests: { orderBy: { guestOrder: "asc" } },
    },
  });
  if (!reservation) throw new Error(`Reservation ${args.reservationId} not found`);
  if (!reservation.phone)
    throw new Error("لا يوجد رقم هاتف مسجّل لهذا الحجز.");

  const phoneDigits = reservation.phone.replace(/[^0-9]/g, "");
  if (phoneDigits.length < 8)
    throw new Error(`رقم الهاتف غير صالح: ${reservation.phone}`);

  // Resolve a PDF media_id once (reused if header supports it AND for
  // follow-up). When nothing is supplied we auto-generate the booking
  // contract — this is the path taken by the auto-trigger on reservation
  // create.
  const mediaId = await resolveMediaId(args, reservation, warnings);

  if (args.documentOnly) {
    if (!mediaId && !args.pdfUrl)
      throw new Error("documentOnly=true يتطلّب PDF (mediaId أو رابط).");
    const factsForCaption = buildReservationFacts(reservation);
    const caption =
      renderCaption(args.welcomeCaption, factsForCaption) ??
      `عقد حجزك في فندق المفرق — ${reservation.confirmationCode ?? `RSV-${reservation.id}`}`;
    const fileName = args.pdfFileName ?? defaultFileName(args.reservationId);
    const docHandle = await beginOutboundLog({
      to: phoneDigits,
      type: "document",
      body: caption,
      reservationId: reservation.id,
      mediaId: mediaId ?? null,
      mediaMimeType: "application/pdf",
      mediaFilename: fileName,
      isInternalNote: false,
      origin: "booking-confirmation:document-only",
    });
    try {
      const docMsg = await sendDocumentOnly({
        to: phoneDigits,
        mediaId,
        url: args.pdfUrl,
        fileName,
        caption,
      });
      if (docHandle) {
        await finishOutboundLog({
          rowId: docHandle.rowId,
          conversationId: docHandle.conversationId,
          contactPhone: phoneDigits,
          ok: { wamid: docMsg },
        });
      }
      return {
        ok: true,
        documentMessageId: docMsg,
        filledVariables: 0,
        warnings,
      };
    } catch (err) {
      if (docHandle) {
        await finishOutboundLog({
          rowId: docHandle.rowId,
          conversationId: docHandle.conversationId,
          contactPhone: phoneDigits,
          err,
        });
      }
      throw err;
    }
  }

  const templateName = args.templateName ?? "booking_confirmation_ar";
  const tpl = await prisma.whatsAppTemplate.findFirst({
    where: args.templateLanguage
      ? { name: templateName, language: args.templateLanguage }
      : { name: templateName },
    orderBy: { lastSyncedAt: "desc" },
  });
  if (!tpl)
    throw new Error(
      `القالب "${templateName}" غير موجود محلياً. اضغط مزامنة من Meta أولاً.`,
    );
  if (tpl.status !== "APPROVED")
    throw new Error(
      `القالب "${templateName}" حالته ${tpl.status} — لا يمكن إرساله.`,
    );

  // Build the values map keyed by `TemplateVariable.id` produced by inspect.
  const inspected = inspectTemplate(tpl.components);

  const facts = buildReservationFacts(reservation);
  const values: Record<string, string> = {};
  for (const v of inspected.variables) {
    if (v.scope === "header" && v.paramType === "document" && (mediaId || args.pdfUrl)) {
      values[v.id] = mediaId ?? args.pdfUrl!;
      continue;
    }
    if (v.scope === "header" && v.paramType !== "text") {
      // Non-document media header but we don't have a matching asset.
      values[v.id] = v.defaultValue ?? "";
      continue;
    }
    if (v.scope === "body") {
      values[v.id] = facts.bodyByIndex[v.index] ?? v.defaultValue ?? `[{{${v.index}}}]`;
      continue;
    }
    if (v.scope === "button") {
      // Best-effort: re-use the booking reference for OTP-style buttons that
      // happen to be on this template.
      values[v.id] = v.defaultValue ?? facts.reference;
      continue;
    }
    values[v.id] = v.defaultValue ?? "";
  }

  // Per-variable metadata: ensure the document header surfaces a real
  // filename in WhatsApp clients (otherwise Meta defaults to a generic
  // "document.pdf" — and many clients then refuse to render the PDF
  // first-page thumbnail).
  const docFilename = args.pdfFileName ?? defaultFileName(args.reservationId);
  const valueMeta: Record<string, { filename?: string }> = {};
  for (const v of inspected.variables) {
    if (
      v.scope === "header" &&
      (v.paramType === "document" ||
        v.paramType === "image" ||
        v.paramType === "video")
    ) {
      valueMeta[v.id] = { filename: docFilename };
    }
  }

  const components = buildSendComponents({
    components: tpl.components,
    values,
    valueMeta,
  });

  let templateMessageId: string | undefined;
  const tplHandle = await beginOutboundLog({
    to: phoneDigits,
    type: "template",
    body: null,
    templateName: tpl.name,
    reservationId: reservation.id,
    origin: "booking-confirmation:template",
  });
  try {
    const meta = await sendTemplate({
      to: phoneDigits,
      templateName: tpl.name,
      language: tpl.language,
      components: inspected.isStatic ? [] : components,
    });
    templateMessageId = meta.messages?.[0]?.id;
    if (tplHandle) {
      await finishOutboundLog({
        rowId: tplHandle.rowId,
        conversationId: tplHandle.conversationId,
        contactPhone: phoneDigits,
        ok: { wamid: templateMessageId ?? null, raw: meta },
      });
    }
  } catch (err) {
    if (tplHandle) {
      await finishOutboundLog({
        rowId: tplHandle.rowId,
        conversationId: tplHandle.conversationId,
        contactPhone: phoneDigits,
        err,
      });
    }
    if (isWhatsAppApiError(err)) {
      throw new Error(
        `Meta رفضت القالب: ${err.message} (code ${err.code ?? "?"})`,
      );
    }
    throw err;
  }

  // Optional: send the PDF as a follow-up if the template's header is
  // not DOCUMENT itself and we have an asset to share.
  let documentMessageId: string | undefined;
  const headerHasDoc = inspected.variables.some(
    (v) => v.scope === "header" && v.paramType === "document",
  );
  if (!headerHasDoc && (mediaId || args.pdfUrl)) {
    const followCaption =
      renderCaption(args.welcomeCaption, facts) ?? `عقد حجزك — ${facts.reference}`;
    const followFileName = args.pdfFileName ?? defaultFileName(args.reservationId);
    const followHandle = await beginOutboundLog({
      to: phoneDigits,
      type: "document",
      body: followCaption,
      reservationId: reservation.id,
      mediaId: mediaId ?? null,
      mediaMimeType: "application/pdf",
      mediaFilename: followFileName,
      origin: "booking-confirmation:follow-up",
    });
    try {
      documentMessageId = await sendDocumentOnly({
        to: phoneDigits,
        mediaId,
        url: args.pdfUrl,
        fileName: followFileName,
        caption: followCaption,
      });
      if (followHandle) {
        await finishOutboundLog({
          rowId: followHandle.rowId,
          conversationId: followHandle.conversationId,
          contactPhone: phoneDigits,
          ok: { wamid: documentMessageId ?? null },
        });
      }
    } catch (err) {
      if (followHandle) {
        await finishOutboundLog({
          rowId: followHandle.rowId,
          conversationId: followHandle.conversationId,
          contactPhone: phoneDigits,
          err,
        });
      }
      // Non-fatal: the structured confirmation already arrived.
      warnings.push(
        `تم إرسال القالب لكن المرفق فشل: ${(err as Error).message ?? err}`,
      );
    }
  }

  // Optional second message — Quranic/Sunnah blessing or any custom
  // free-text. The main template already opened the 24-hour customer-
  // service window so plain text is allowed without a second template.
  let followUpMessageId: string | undefined;
  const followUpRendered = renderCaption(args.followUpText ?? undefined, facts);
  if (followUpRendered) {
    const followHandle = await beginOutboundLog({
      to: phoneDigits,
      type: "text",
      body: followUpRendered,
      reservationId: reservation.id,
      origin: "booking-confirmation:follow-up-text",
    });
    try {
      const followMeta = await sendText({
        to: phoneDigits,
        text: followUpRendered,
      });
      followUpMessageId = followMeta.messages?.[0]?.id;
      if (followHandle) {
        await finishOutboundLog({
          rowId: followHandle.rowId,
          conversationId: followHandle.conversationId,
          contactPhone: phoneDigits,
          ok: { wamid: followUpMessageId ?? null, raw: followMeta },
        });
      }
    } catch (err) {
      if (followHandle) {
        await finishOutboundLog({
          rowId: followHandle.rowId,
          conversationId: followHandle.conversationId,
          contactPhone: phoneDigits,
          err,
        });
      }
      // Non-fatal: confirmation already arrived.
      warnings.push(
        `تم تأكيد الحجز لكن رسالة الذكر فشلت: ${(err as Error).message ?? err}`,
      );
    }
  }

  return {
    ok: true,
    templateMessageId,
    documentMessageId,
    followUpMessageId,
    filledVariables: inspected.variables.length,
    warnings,
  };
}

// ───────────────────────────── Internals ────────────────────────────────

type ReservationWithRelations = NonNullable<
  Awaited<ReturnType<typeof prisma.reservation.findUnique>>
> & {
  unit?: {
    unitNumber: string;
    unitType: string;
    unitTypeRef?: { nameAr?: string | null; nameEn?: string | null } | null;
  } | null;
  guests?: Array<{
    fullName: string;
    idNumber: string;
    nationality?: string | null;
    guestOrder?: number | null;
  }>;
};

async function resolveMediaId(
  args: SendBookingConfirmationInput,
  reservation: ReservationWithRelations,
  warnings: string[],
): Promise<string | undefined> {
  if (args.pdfMediaId) return args.pdfMediaId;

  // 1) Caller-supplied buffer takes priority (manual override).
  let buffer: Buffer | undefined = args.pdfBuffer;

  // 2) Otherwise, auto-render the contract PDF unless explicitly disabled.
  if (!buffer && !args.pdfUrl && !args.skipContractPdf) {
    try {
      const html = await renderContractHtml({
        id: reservation.id,
        guestName: reservation.guestName,
        phone: reservation.phone,
        numNights: reservation.numNights,
        stayType: reservation.stayType,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        unitPrice: reservation.unitPrice,
        totalAmount: reservation.totalAmount,
        paidAmount: reservation.paidAmount,
        remaining: reservation.remaining,
        paymentMethod: reservation.paymentMethod,
        numGuests: reservation.numGuests,
        unit: {
          unitNumber: reservation.unit?.unitNumber ?? "—",
          unitType: reservation.unit?.unitType ?? "",
        },
        guests: (reservation.guests ?? []).map((g) => ({
          fullName: g.fullName,
          idNumber: g.idNumber,
          nationality: g.nationality,
        })),
      });
      buffer = await htmlToPdf(html);
    } catch (err) {
      warnings.push(
        `تعذّر توليد PDF العقد تلقائياً: ${(err as Error).message ?? err}`,
      );
      return undefined;
    }
  }

  if (!buffer) return undefined;

  try {
    const { id } = await uploadPhoneMedia({
      fileBuffer: buffer,
      mimeType: "application/pdf",
      fileName: args.pdfFileName ?? defaultFileName(args.reservationId),
    });
    return id;
  } catch (err) {
    warnings.push(`فشل رفع الـPDF: ${(err as Error).message ?? err}`);
    return undefined;
  }
}

interface ReservationFacts {
  bodyByIndex: Record<number, string>;
  reference: string;
}

function buildReservationFacts(
  reservation: NonNullable<
    Awaited<ReturnType<typeof prisma.reservation.findUnique>>
  > & {
    unit?: {
      unitTypeRef?: { nameAr?: string | null; nameEn?: string | null } | null;
      unitType?: string | null;
    } | null;
  },
): ReservationFacts {
  const reference =
    reservation.confirmationCode ?? `RSV-${reservation.id}`;

  // Hotel-policy times (clause 12 in the contract): check-in 2:00 PM,
  // check-out 12:00 PM. Render the dates with a friendly Arabic time
  // suffix so the welcome caption reads naturally without forcing a
  // schema change for the actual stay timestamps.
  const fmtDateAr = (d: Date) => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };
  const checkInPretty = `${fmtDateAr(reservation.checkIn)} الساعة الثانية ظهراً`;
  const checkOutPretty = `${fmtDateAr(reservation.checkOut)} الساعة الثانية عشرة ظهراً`;

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat("ar-JO", {
      style: "currency",
      currency: "JOD",
      maximumFractionDigits: 2,
    }).format(n);

  return {
    reference,
    bodyByIndex: {
      1: reservation.guestName,
      2: checkInPretty,
      3: checkOutPretty,
      4: reference,
      5: String(reservation.numNights),
      6: fmtMoney(reservation.totalAmount),
      7: fmtMoney(reservation.remaining),
      8:
        reservation.unit?.unitTypeRef?.nameAr ??
        reservation.unit?.unitTypeRef?.nameEn ??
        reservation.unit?.unitType ??
        "",
    },
  };
}

/**
 * Hotel-branded PDF filename used both for the Meta media-upload form
 * field and the `document.filename` Meta surfaces in WhatsApp clients.
 * Format: `Booking-MH-NNNN.pdf` (zero-padded to 4 digits) — matches
 * the contract numbering printed on the PDF header.
 *
 * MH = Mafraq Hotel.
 */
function defaultFileName(reservationId: number): string {
  return `Booking-MH-${String(reservationId).padStart(4, "0")}.pdf`;
}

/**
 * Substitute `{{1}}..{{N}}` in a free-text caption with the same body
 * facts the structured template uses. Returns undefined when the input
 * is empty so the caller can keep its sensible fallback.
 */
function renderCaption(
  template: string | undefined,
  facts: ReservationFacts,
): string | undefined {
  if (!template) return undefined;
  const trimmed = template.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, idx: string) => {
    const i = Number(idx);
    return facts.bodyByIndex[i] ?? `{{${idx}}}`;
  });
}

async function sendDocumentOnly(args: {
  to: string;
  mediaId?: string;
  url?: string;
  fileName: string;
  caption?: string;
}): Promise<string> {
  const out = await sendDocument({
    to: args.to,
    mediaId: args.mediaId,
    url: args.url,
    fileName: args.fileName,
    caption: args.caption,
  });
  const id = out.messages?.[0]?.id;
  if (!id) throw new Error("Document send failed: no message id returned");
  return id;
}
