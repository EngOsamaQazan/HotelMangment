import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/whatsapp/bot/allowlist/[id] — toggle isActive or update note.
 * DELETE /api/whatsapp/bot/allowlist/[id] — hard delete.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    try {
      await requirePermission("whatsapp.bot:manage_allowlist");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: "id غير صالح" }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      isActive?: boolean;
      note?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.note !== undefined) data.note = body.note?.trim() || null;
    const row = await prisma.botAllowlist.update({
      where: { id: idNum },
      data,
    });
    return NextResponse.json(row);
  } catch (err) {
    console.error("[PATCH /api/whatsapp/bot/allowlist/[id]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر التعديل" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    try {
      await requirePermission("whatsapp.bot:manage_allowlist");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const { id } = await ctx.params;
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: "id غير صالح" }, { status: 400 });
    }
    await prisma.botAllowlist.delete({ where: { id: idNum } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/whatsapp/bot/allowlist/[id]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر الحذف" },
      { status: 500 },
    );
  }
}
