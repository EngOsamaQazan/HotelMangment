import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  createTemplate,
  isWhatsAppApiError,
  type CreateTemplateArgs,
  type TemplateCategory,
} from "@/lib/whatsapp/client";

/**
 * POST /api/whatsapp/templates/create
 *
 * Body: {
 *   name, language, category, components: unknown[], allow_category_change?
 * }
 *
 * Submits a new template to Meta and mirrors it locally as PENDING. The
 * client supplies the components array verbatim — building the correct
 * shape is the form's responsibility (see the create-template modal).
 */
export async function POST(request: Request) {
  try {
    await requirePermission("whatsapp:create_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<CreateTemplateArgs>;
    const name = (body.name ?? "").trim().toLowerCase();
    const language = (body.language ?? "").trim();
    const category = body.category as TemplateCategory | undefined;
    const components = Array.isArray(body.components) ? body.components : [];

    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      return NextResponse.json(
        { error: "اسم القالب: حروف إنجليزية صغيرة وأرقام و _ فقط (≤ 512 حرف)" },
        { status: 400 },
      );
    }
    if (!language) {
      return NextResponse.json({ error: "اللغة مطلوبة" }, { status: 400 });
    }
    if (!category || !["AUTHENTICATION", "MARKETING", "UTILITY"].includes(category)) {
      return NextResponse.json({ error: "فئة غير صالحة" }, { status: 400 });
    }
    if (components.length === 0) {
      return NextResponse.json(
        { error: "يجب إضافة مكوّن واحد على الأقل (BODY أو OTP)" },
        { status: 400 },
      );
    }

    const created = await createTemplate({
      name,
      language,
      category,
      components,
      allow_category_change: body.allow_category_change ?? false,
    });

    // Mirror locally so the templates list updates immediately.
    await prisma.whatsAppTemplate.upsert({
      where: { metaId: created.id },
      create: {
        metaId: created.id,
        name,
        language,
        category: created.category ?? category,
        status: created.status ?? "PENDING",
        components: components as Prisma.InputJsonValue,
        rejectionReason: null,
      },
      update: {
        status: created.status ?? "PENDING",
        components: components as Prisma.InputJsonValue,
        category: created.category ?? category,
        rejectionReason: null,
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, template: created });
  } catch (err) {
    console.error("[POST /api/whatsapp/templates/create]", err);
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error: apiErr?.message ?? (err as Error).message ?? "تعذّر إنشاء القالب",
        code: apiErr?.code,
        subcode: apiErr?.subcode,
      },
      { status: apiErr?.status ?? 502 },
    );
  }
}
