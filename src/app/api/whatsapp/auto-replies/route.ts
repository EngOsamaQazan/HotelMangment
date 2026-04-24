import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/auto-replies  — list all rules ordered by priority.
 * POST /api/whatsapp/auto-replies — create a new rule.
 */

const VALID_MODES = new Set(["keyword", "exact", "regex", "welcome", "away"]);

export async function GET() {
  try {
    try {
      await requirePermission("settings.whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const rules = await prisma.whatsAppAutoReplyRule.findMany({
      orderBy: [{ priority: "asc" }, { id: "asc" }],
    });
    return NextResponse.json(rules);
  } catch (err) {
    console.error("[GET /api/whatsapp/auto-replies]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "فشل التحميل" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("settings.whatsapp:edit");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = await req.json();
    const name = String(body.name ?? "").trim();
    const matchMode = String(body.matchMode ?? "keyword");
    const triggers = String(body.triggers ?? "").trim();
    const replyText = String(body.replyText ?? "").trim();
    const templateName = body.templateName
      ? String(body.templateName).trim() || null
      : null;
    const quietHoursStart = body.quietHoursStart ? String(body.quietHoursStart) : null;
    const quietHoursEnd = body.quietHoursEnd ? String(body.quietHoursEnd) : null;
    const priority = Number.isFinite(Number(body.priority))
      ? Number(body.priority)
      : 100;
    const cooldownMinutes = Number.isFinite(Number(body.cooldownMinutes))
      ? Math.max(0, Number(body.cooldownMinutes))
      : 60;
    const addTag = body.addTag ? String(body.addTag).trim() || null : null;
    const isActive = body.isActive !== false;

    if (!name) {
      return NextResponse.json({ error: "اسم القاعدة مطلوب" }, { status: 400 });
    }
    if (!VALID_MODES.has(matchMode)) {
      return NextResponse.json(
        { error: "نمط المطابقة غير معروف" },
        { status: 400 },
      );
    }
    if (!replyText && !templateName) {
      return NextResponse.json(
        { error: "نص الرد أو اسم القالب مطلوب" },
        { status: 400 },
      );
    }
    if ((matchMode === "keyword" || matchMode === "exact") && !triggers) {
      return NextResponse.json(
        { error: "الكلمات المفتاحية مطلوبة لهذا النمط" },
        { status: 400 },
      );
    }
    if (matchMode === "regex" && !triggers) {
      return NextResponse.json(
        { error: "تعبير نمطي (regex) مطلوب" },
        { status: 400 },
      );
    }

    const userId = Number((session.user as { id?: string | number }).id);
    const rule = await prisma.whatsAppAutoReplyRule.create({
      data: {
        name,
        matchMode,
        triggers,
        replyText,
        templateName,
        quietHoursStart,
        quietHoursEnd,
        priority,
        cooldownMinutes,
        addTag,
        isActive,
        createdByUserId: Number.isFinite(userId) ? userId : null,
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    console.error("[POST /api/whatsapp/auto-replies]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "فشل إنشاء القاعدة" },
      { status: 500 },
    );
  }
}
