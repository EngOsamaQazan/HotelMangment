import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

// ---------------------------------------------------------------------------
// /api/assistant/learning/lessons
//
// GET    — list lessons (filter by status; defaults to "all")
// POST   — create a hand-written lesson (admin types directly, status flips
//          to "approved" immediately because the author *is* the reviewer).
// ---------------------------------------------------------------------------

const ALLOWED_SCOPES = new Set([
  "global",
  "module:guests",
  "module:reservations",
  "module:accounting",
  "module:tasks",
  "module:maintenance",
  "module:rooms",
  "module:settings",
  "module:assistant",
]);

export async function GET(request: Request) {
  try {
    await requirePermission("assistant:learning_review");
    const { searchParams } = new URL(request.url);
    const status = (searchParams.get("status") || "all").toLowerCase();
    const scope = (searchParams.get("scope") || "").trim();

    const where: Record<string, unknown> = {};
    if (status !== "all") where.status = status;
    if (scope) where.scope = scope;

    const rows = await prisma.assistantLesson.findMany({
      where,
      orderBy: [{ status: "asc" }, { usageCount: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        title: true,
        triggerKeywords: true,
        guidance: true,
        scope: true,
        status: true,
        proposedByLlm: true,
        sourceFailureId: true,
        usageCount: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const counts = await prisma.assistantLesson.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const summary = {
      draft: counts.find((c) => c.status === "draft")?._count._all ?? 0,
      approved: counts.find((c) => c.status === "approved")?._count._all ?? 0,
      disabled: counts.find((c) => c.status === "disabled")?._count._all ?? 0,
    };

    return NextResponse.json({
      lessons: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      })),
      summary,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/learning/lessons", e);
    return NextResponse.json({ error: "فشل تحميل الدروس" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("assistant:learning_review");
    const reviewerId = Number((session.user as { id?: string | number }).id);

    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      triggerKeywords?: string;
      guidance?: string;
      scope?: string;
    };
    const title = (body.title || "").trim();
    const guidance = (body.guidance || "").trim();
    const triggerKeywords = (body.triggerKeywords || "").trim();
    const scope = (body.scope || "global").trim();

    if (!title) return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
    if (!guidance) return NextResponse.json({ error: "نص الدرس مطلوب" }, { status: 400 });
    if (!ALLOWED_SCOPES.has(scope)) {
      return NextResponse.json({ error: "نطاق غير صالح" }, { status: 400 });
    }

    const created = await prisma.assistantLesson.create({
      data: {
        title: title.slice(0, 200),
        triggerKeywords: triggerKeywords.slice(0, 500),
        guidance: guidance.slice(0, 2000),
        scope,
        status: "approved",
        proposedByLlm: false,
        reviewedById: Number.isFinite(reviewerId) ? reviewerId : null,
        reviewedAt: new Date(),
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, lessonId: created.id });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/learning/lessons", e);
    return NextResponse.json({ error: "فشل إنشاء الدرس" }, { status: 500 });
  }
}
