import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export const runtime = "nodejs";

/**
 * PUT    /api/whatsapp/auto-replies/[id]  — update an existing rule.
 * DELETE /api/whatsapp/auto-replies/[id]  — delete a rule.
 */

const VALID_MODES = new Set(["keyword", "exact", "regex", "welcome", "away"]);

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await requirePermission("settings.whatsapp:edit");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const { id } = await ctx.params;
    const ruleId = Number(id);
    if (!Number.isFinite(ruleId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const v = body.name.trim();
      if (!v) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
      data.name = v;
    }
    if (typeof body.matchMode === "string") {
      if (!VALID_MODES.has(body.matchMode)) {
        return NextResponse.json(
          { error: "نمط المطابقة غير معروف" },
          { status: 400 },
        );
      }
      data.matchMode = body.matchMode;
    }
    if (typeof body.triggers === "string") data.triggers = body.triggers.trim();
    if (typeof body.replyText === "string") data.replyText = body.replyText.trim();
    if (body.templateName !== undefined) {
      data.templateName = body.templateName
        ? String(body.templateName).trim() || null
        : null;
    }
    if (body.quietHoursStart !== undefined) {
      data.quietHoursStart = body.quietHoursStart
        ? String(body.quietHoursStart)
        : null;
    }
    if (body.quietHoursEnd !== undefined) {
      data.quietHoursEnd = body.quietHoursEnd ? String(body.quietHoursEnd) : null;
    }
    if (body.priority !== undefined) {
      const n = Number(body.priority);
      if (Number.isFinite(n)) data.priority = n;
    }
    if (body.cooldownMinutes !== undefined) {
      const n = Number(body.cooldownMinutes);
      if (Number.isFinite(n)) data.cooldownMinutes = Math.max(0, n);
    }
    if (body.addTag !== undefined) {
      data.addTag = body.addTag ? String(body.addTag).trim() || null : null;
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const rule = await prisma.whatsAppAutoReplyRule.update({
      where: { id: ruleId },
      data,
    });
    return NextResponse.json(rule);
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    console.error("[PUT /api/whatsapp/auto-replies/:id]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "فشل التحديث" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await requirePermission("settings.whatsapp:edit");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const { id } = await ctx.params;
    const ruleId = Number(id);
    if (!Number.isFinite(ruleId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await prisma.whatsAppAutoReplyRule.delete({ where: { id: ruleId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    console.error("[DELETE /api/whatsapp/auto-replies/:id]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "فشل الحذف" },
      { status: 500 },
    );
  }
}
