import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

// ---------------------------------------------------------------------------
// PATCH /api/assistant/learning/failures/[id]
//
// Update the lifecycle status of an AssistantFailure row from the admin
// inbox. Allowed transitions:
//   open       → dismissed | addressed
//   drafted    → addressed | dismissed
//   addressed  → open                  (re-open if the issue resurfaces)
//   dismissed  → open
//
// Body: { status: "dismissed" | "addressed" | "open", reviewNote?: string }
// ---------------------------------------------------------------------------

const ALLOWED = new Set(["open", "dismissed", "addressed"]);

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("assistant:learning_review");
    const reviewerId = Number((session.user as { id?: string | number }).id);
    const { id } = await ctx.params;
    const failureId = Number(id);
    if (!Number.isFinite(failureId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      status?: string;
      reviewNote?: string;
    };
    const status = String(body.status || "").toLowerCase();
    if (!ALLOWED.has(status)) {
      return NextResponse.json({ error: "حالة غير مسموحة" }, { status: 400 });
    }
    const note = typeof body.reviewNote === "string" ? body.reviewNote.slice(0, 1000) : null;

    const updated = await prisma.assistantFailure.update({
      where: { id: failureId },
      data: {
        status,
        reviewNote: note,
        reviewedById: Number.isFinite(reviewerId) ? reviewerId : null,
        reviewedAt: new Date(),
      },
      select: { id: true, status: true },
    });
    return NextResponse.json({ ok: true, failure: updated });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("PATCH /api/assistant/learning/failures/[id]", e);
    return NextResponse.json({ error: "فشل تحديث الإخفاق" }, { status: 500 });
  }
}
