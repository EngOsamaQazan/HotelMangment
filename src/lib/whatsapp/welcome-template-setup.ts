import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createTemplate,
  uploadResumableMedia,
  type CreateTemplateArgs,
} from "./client";
import { renderContractHtml } from "@/lib/contract/render-html";
import { htmlToPdf } from "@/lib/pdf/browser";

/**
 * Programmatic submission of the "warm welcome + PDF" template to Meta.
 *
 * Why a dedicated helper?
 *   The default `booking_confirmation_ar` template was approved with a
 *   TEXT header → it cannot embed the contract PDF, so the runtime falls
 *   back to a 2-message flow (template + follow-up document). Operators
 *   who want a single rich message (PDF rendered inside the welcome
 *   bubble itself) need a template whose header type is DOCUMENT and
 *   whose body carries the same warm copy we already use as the
 *   document caption.
 *
 *   This module encapsulates that template's exact shape, generates a
 *   sample contract PDF for Meta's review queue, uploads it via the
 *   Resumable Upload API, and submits the template — all in one step.
 *
 * Once Meta approves the template (UTILITY category, usually < 1 hour),
 * the operator simply switches `bookingConfirmationTemplate` to its
 * name (`booking_welcome_ar` by default) from /settings/whatsapp and
 * the auto-trigger automatically sends:
 *    1) ONE rich message (warm body + PDF inline)
 *    2) The Quranic / Sunnah follow-up text
 * — exactly two messages, instead of three.
 */

export const WARM_TEMPLATE_NAME = "booking_welcome_ar";
export const WARM_TEMPLATE_LANGUAGE = "ar";

/**
 * Body copy used inside the template. Must match WhatsApp formatting
 * rules: single-asterisk for bold, max 1024 chars, no leading/trailing
 * whitespace, no two consecutive `\n\n\n`.
 */
const WARM_TEMPLATE_BODY = `هلا وغلا 🌙
نورت فندق المفرق يا *{{1}}*، حياك الله بين أهلك ❤️

تم تأكيد حجزك:
📅 الوصول: {{2}}
📅 المغادرة: {{3}}
🏷️ رقم الحجز: {{4}}

أرفقنا لك *عقد الإقامة* للاطلاع 📎

كل الليالي مباركة… والليلة أبرك بوجودك 🙏
بانتظارك، وأي شي تحتاجه احنا بالخدمة 24 ساعة 🤝`;

const WARM_TEMPLATE_FOOTER = "فندق المفرق — في خدمتك دائماً";

/**
 * Body sample values Meta uses to render a preview during review.
 * Order MUST match {{1}}..{{4}} in the body above.
 */
const WARM_TEMPLATE_BODY_EXAMPLES = [
  "كيفورك جارابيت",
  "25-04-2026 الساعة الثانية ظهراً",
  "26-04-2026 الساعة الثانية عشرة ظهراً",
  "RSV-84",
];

/**
 * Generate a tiny representative contract PDF that Meta's review team
 * can preview as the document sample. Uses placeholder reservation data
 * — never references a real guest. Returns a Buffer ready to upload.
 */
async function buildSamplePdf(): Promise<Buffer> {
  const html = await renderContractHtml({
    id: 0,
    guestName: "كيفورك جارابيت",
    phone: "+962 7XX XXX XXX",
    numNights: 1,
    stayType: "daily",
    checkIn: new Date(),
    checkOut: new Date(Date.now() + 24 * 60 * 60 * 1000),
    unitPrice: 50,
    totalAmount: 50,
    paidAmount: 50,
    remaining: 0,
    paymentMethod: "cash",
    numGuests: 2,
    unit: { unitNumber: "101", unitType: "room" },
    guests: [
      {
        fullName: "كيفورك جارابيت",
        idNumber: "—",
        nationality: "الأردن",
      },
    ],
  });
  return htmlToPdf(html);
}

export interface WelcomeTemplateSetupResult {
  templateName: string;
  language: string;
  metaId: string;
  status: string;
  category?: string;
}

/**
 * One-shot: build sample PDF → upload as resumable media → submit
 * the warm template to Meta → mirror locally as PENDING. Caller is
 * responsible for surfacing the (potentially long) approval status.
 */
export async function submitWarmWelcomeTemplate(): Promise<WelcomeTemplateSetupResult> {
  // 1) Render + upload the sample PDF.
  const pdf = await buildSamplePdf();
  const { handle } = await uploadResumableMedia({
    fileBuffer: pdf,
    mimeType: "application/pdf",
    fileName: "booking-contract-sample.pdf",
  });

  // 2) Build the components array Meta expects.
  const components: CreateTemplateArgs["components"] = [
    {
      type: "HEADER",
      format: "DOCUMENT",
      example: { header_handle: [handle] },
    },
    {
      type: "BODY",
      text: WARM_TEMPLATE_BODY,
      example: { body_text: [WARM_TEMPLATE_BODY_EXAMPLES] },
    },
    { type: "FOOTER", text: WARM_TEMPLATE_FOOTER },
  ];

  // 3) Submit to Meta.
  const created = await createTemplate({
    name: WARM_TEMPLATE_NAME,
    language: WARM_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    components,
    allow_category_change: false,
  });

  // 4) Mirror locally as PENDING so the templates list shows it
  //    immediately. The status sync job will flip it to APPROVED later.
  await prisma.whatsAppTemplate.upsert({
    where: { metaId: created.id },
    create: {
      metaId: created.id,
      name: WARM_TEMPLATE_NAME,
      language: WARM_TEMPLATE_LANGUAGE,
      category: created.category ?? "UTILITY",
      status: created.status ?? "PENDING",
      components: components as unknown as Prisma.InputJsonValue,
      rejectionReason: null,
    },
    update: {
      status: created.status ?? "PENDING",
      category: created.category ?? "UTILITY",
      components: components as unknown as Prisma.InputJsonValue,
      rejectionReason: null,
      lastSyncedAt: new Date(),
    },
  });

  return {
    templateName: WARM_TEMPLATE_NAME,
    language: WARM_TEMPLATE_LANGUAGE,
    metaId: created.id,
    status: created.status ?? "PENDING",
    category: created.category,
  };
}
