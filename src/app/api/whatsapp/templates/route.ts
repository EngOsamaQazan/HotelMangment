import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { listTemplates, isWhatsAppApiError } from "@/lib/whatsapp/client";

/** GET /api/whatsapp/templates — list cached templates. */
export async function GET() {
  try {
    try {
      await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const rows = await prisma.whatsAppTemplate.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/whatsapp/templates]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل القوالب" },
      { status: 500 },
    );
  }
}

/** POST /api/whatsapp/templates — sync from Meta. */
export async function POST() {
  try {
    await requirePermission("whatsapp:sync_templates");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const remote = await listTemplates();

    // Upsert everything we see.
    for (const t of remote) {
      const components = (t.components ?? Prisma.JsonNull) as Prisma.InputJsonValue;
      await prisma.whatsAppTemplate.upsert({
        where: { metaId: t.id },
        create: {
          metaId: t.id,
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components,
          rejectionReason: t.rejected_reason ?? null,
        },
        update: {
          name: t.name,
          language: t.language,
          category: t.category,
          status: t.status,
          components,
          rejectionReason: t.rejected_reason ?? null,
          lastSyncedAt: new Date(),
        },
      });
    }
    return NextResponse.json({ ok: true, count: remote.length });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر جلب القوالب" },
      { status: apiErr?.status ?? 502 },
    );
  }
}
