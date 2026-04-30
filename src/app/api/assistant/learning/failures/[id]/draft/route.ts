import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { draftLessonForFailure } from "@/lib/assistant/learning/lesson-drafter";

// ---------------------------------------------------------------------------
// POST /api/assistant/learning/failures/[id]/draft
//
// Run a one-shot LLM call against the failure to produce an
// AssistantLesson(status="draft"). The drafter is rate-limited by the
// admin manually clicking "اقترح درساً" — there's no cron loop — so this
// route is intentionally simple.
// ---------------------------------------------------------------------------

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("assistant:learning_review");
    const { id } = await ctx.params;
    const failureId = Number(id);
    if (!Number.isFinite(failureId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    const result = await draftLessonForFailure(failureId);
    if (!result.ok) {
      const status = result.errorCode === "not_found" ? 404 : 400;
      return NextResponse.json(
        { error: result.message, code: result.errorCode },
        { status },
      );
    }
    return NextResponse.json({
      ok: true,
      lessonId: result.lessonId,
      message: result.message,
      cost: result.cost ?? 0,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/learning/failures/[id]/draft", e);
    return NextResponse.json({ error: "فشل اقتراح الدرس" }, { status: 500 });
  }
}
