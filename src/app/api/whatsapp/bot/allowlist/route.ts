import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { normalizePhone } from "@/lib/whatsapp/bot/identity";

/**
 * GET  /api/whatsapp/bot/allowlist — list every entry (newest first).
 * POST /api/whatsapp/bot/allowlist — add an entry { phone, note? }.
 *
 * Used during Layer 4 of the staged rollout: when `WhatsAppConfig.botMode
 * = "allowlist"`, only contacts present in this table receive bot replies.
 * Everything else falls through to the existing inbox + auto-reply path.
 */
export async function GET() {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp.bot:manage_allowlist");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    void session;

    const rows = await prisma.botAllowlist.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        addedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/whatsapp/bot/allowlist]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل القائمة" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp.bot:manage_allowlist");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json().catch(() => ({}))) as {
      phone?: string;
      note?: string | null;
    };
    const phone = normalizePhone(body.phone ?? "");
    if (!phone) {
      return NextResponse.json(
        { error: "رقم الهاتف مطلوب وغير صالح" },
        { status: 400 },
      );
    }

    const userId = Number((session.user as { id?: string | number }).id);
    const row = await prisma.botAllowlist.upsert({
      where: { phone },
      create: {
        phone,
        note: body.note?.trim() || null,
        addedByUserId: userId,
        isActive: true,
      },
      update: {
        note: body.note?.trim() || null,
        isActive: true,
      },
      include: { addedBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("[POST /api/whatsapp/bot/allowlist]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر إضافة الرقم" },
      { status: 500 },
    );
  }
}
