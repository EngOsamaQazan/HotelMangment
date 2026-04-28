import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTemplate, type CreateTemplateArgs } from "./client";

/**
 * Minimal "intro" template — its only job is to OPEN the 24-hour
 * customer-service window so we can immediately follow up with the
 * standalone PDF + warm caption (full preview, full text, no
 * "Read More" truncation) and the Quranic / Sunnah blessing.
 *
 * Body intentionally has NO variables: every booking-specific detail
 * (name, dates, RSV number) is already carried by the warm PDF caption
 * that arrives a fraction of a second later. Re-stating it inside the
 * template would create the redundant 3rd "formal Hello…" message the
 * operator complained about.
 *
 * Category UTILITY → typically approved by Meta within an hour.
 */
export const INTRO_TEMPLATE_NAME = "booking_intro_ar";
export const INTRO_TEMPLATE_LANGUAGE = "ar";

const INTRO_TEMPLATE_BODY = `🌙 تم تأكيد حجزك في فندق المفرق ✅
تفاصيل الإقامة وعقد السكن في الملف المُرفق 📎`;

const INTRO_TEMPLATE_FOOTER = "فندق المفرق — في خدمتك دائماً";

export interface IntroTemplateSetupResult {
  templateName: string;
  language: string;
  metaId: string;
  status: string;
  category?: string;
}

export async function submitIntroTemplate(): Promise<IntroTemplateSetupResult> {
  const components: CreateTemplateArgs["components"] = [
    { type: "BODY", text: INTRO_TEMPLATE_BODY },
    { type: "FOOTER", text: INTRO_TEMPLATE_FOOTER },
  ];

  const created = await createTemplate({
    name: INTRO_TEMPLATE_NAME,
    language: INTRO_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    components,
    allow_category_change: false,
  });

  await prisma.whatsAppTemplate.upsert({
    where: { metaId: created.id },
    create: {
      metaId: created.id,
      name: INTRO_TEMPLATE_NAME,
      language: INTRO_TEMPLATE_LANGUAGE,
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
    templateName: INTRO_TEMPLATE_NAME,
    language: INTRO_TEMPLATE_LANGUAGE,
    metaId: created.id,
    status: created.status ?? "PENDING",
    category: created.category,
  };
}
