import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

// ---------------------------------------------------------------------------
// PATCH /api/assistant/learning/lessons/[id]
//   - approve a draft       → { status: "approved" }
//   - disable an approved   → { status: "disabled" }
//   - re-enable a disabled  → { status: "approved" }
//   - edit text             → { title?, guidance?, triggerKeywords?, scope? }
//
// DELETE soft-disables the lesson (we keep the row for audit / the
// sourceFailureId trace; admins who want a hard delete can run SQL).
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES = new Set(["draft", "approved", "disabled"]);
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

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("assistant:learning_review");
    const reviewerId = Number((session.user as { id?: string | number }).id);
    const { id } = await ctx.params;
    const lessonId = Number(id);
    if (!Number.isFinite(lessonId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
      title?: string;
      guidance?: string;
      triggerKeywords?: string;
      scope?: string;
    };

    const data: Record<string, unknown> = {};
    if (typeof body.status === "string") {
      const s = body.status.toLowerCase();
      if (!ALLOWED_STATUSES.has(s)) {
        return NextResponse.json({ error: "حالة غير مسموحة" }, { status: 400 });
      }
      data.status = s;
    }
    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ error: "العنوان لا يمكن أن يكون فارغاً" }, { status: 400 });
      data.title = t.slice(0, 200);
    }
    if (typeof body.guidance === "string") {
      const g = body.guidance.trim();
      if (!g) return NextResponse.json({ error: "نص الدرس لا يمكن أن يكون فارغاً" }, { status: 400 });
      data.guidance = g.slice(0, 2000);
    }
    if (typeof body.triggerKeywords === "string") {
      data.triggerKeywords = body.triggerKeywords.trim().slice(0, 500);
    }
    if (typeof body.scope === "string") {
      const s = body.scope.trim();
      if (!ALLOWED_SCOPES.has(s)) {
        return NextResponse.json({ error: "نطاق غير صالح" }, { status: 400 });
      }
      data.scope = s;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد تغييرات" }, { status: 400 });
    }

    data.reviewedById = Number.isFinite(reviewerId) ? reviewerId : null;
    data.reviewedAt = new Date();

    const updated = await prisma.assistantLesson.update({
      where: { id: lessonId },
      data,
      select: { id: true, status: true },
    });

    // When a lesson based on a failure becomes approved, mark the failure
    // as "addressed" so it leaves the open inbox.
    if (data.status === "approved") {
      const lesson = await prisma.assistantLesson.findUnique({
        where: { id: lessonId },
        select: { sourceFailureId: true },
      });
      if (lesson?.sourceFailureId) {
        await prisma.assistantFailure.updateMany({
          where: { id: lesson.sourceFailureId, status: { not: "addressed" } },
          data: { status: "addressed", reviewedById: data.reviewedById as number | null, reviewedAt: data.reviewedAt as Date },
        });
      }
    }

    return NextResponse.json({ ok: true, lesson: updated });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("PATCH /api/assistant/learning/lessons/[id]", e);
    return NextResponse.json({ error: "فشل تحديث الدرس" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("assistant:learning_review");
    const reviewerId = Number((session.user as { id?: string | number }).id);
    const { id } = await ctx.params;
    const lessonId = Number(id);
    if (!Number.isFinite(lessonId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }
    await prisma.assistantLesson.update({
      where: { id: lessonId },
      data: {
        status: "disabled",
        reviewedById: Number.isFinite(reviewerId) ? reviewerId : null,
        reviewedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("DELETE /api/assistant/learning/lessons/[id]", e);
    return NextResponse.json({ error: "فشل تعطيل الدرس" }, { status: 500 });
  }
}
