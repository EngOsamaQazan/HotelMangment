import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  deleteTemplate,
  editTemplate,
  isWhatsAppApiError,
  type TemplateCategory,
} from "@/lib/whatsapp/client";

/**
 * PUT /api/whatsapp/templates/[id]
 *
 * Body: { category?, components? }
 *
 * Edits an existing template at Meta. Meta only accepts `category` and
 * `components` changes — name/language are immutable. After this call the
 * template re-enters review (status -> PENDING).
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("whatsapp:edit_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const { id } = await context.params;
    const local = await prisma.whatsAppTemplate.findFirst({
      where: { OR: [{ id: Number(id) || -1 }, { metaId: id }] },
    });
    if (!local) {
      return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
    }
    if (!local.metaId) {
      return NextResponse.json(
        { error: "القالب لم يُسجَّل بعد على Meta — جرّب إنشاء قالب جديد." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      category?: TemplateCategory;
      components?: unknown[];
    };
    if (!body.category && !Array.isArray(body.components)) {
      return NextResponse.json(
        { error: "لا يوجد تغيير لتطبيقه" },
        { status: 400 },
      );
    }

    await editTemplate({
      metaId: local.metaId,
      category: body.category,
      components: body.components,
    });

    await prisma.whatsAppTemplate.update({
      where: { id: local.id },
      data: {
        status: "PENDING",
        ...(body.category ? { category: body.category } : {}),
        ...(body.components
          ? { components: body.components as Prisma.InputJsonValue }
          : {}),
        rejectionReason: null,
        lastSyncedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error: apiErr?.message ?? (err as Error).message ?? "تعذّر تعديل القالب",
        code: apiErr?.code,
      },
      { status: apiErr?.status ?? 502 },
    );
  }
}

/**
 * DELETE /api/whatsapp/templates/[id]
 *
 * Deletes the specific template variant on Meta + locally. We always pass
 * `hsm_id` (metaId) so we never accidentally delete sibling languages.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("whatsapp:delete_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const { id } = await context.params;
    const local = await prisma.whatsAppTemplate.findFirst({
      where: { OR: [{ id: Number(id) || -1 }, { metaId: id }] },
    });
    if (!local) {
      return NextResponse.json({ error: "القالب غير موجود" }, { status: 404 });
    }

    // If we never had a metaId (manually created stub) we just remove the
    // local row — Meta has nothing to delete.
    if (local.metaId) {
      await deleteTemplate({ name: local.name, hsmId: local.metaId });
    }

    await prisma.whatsAppTemplate.delete({ where: { id: local.id } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error: apiErr?.message ?? (err as Error).message ?? "تعذّر حذف القالب",
        code: apiErr?.code,
      },
      { status: apiErr?.status ?? 502 },
    );
  }
}
