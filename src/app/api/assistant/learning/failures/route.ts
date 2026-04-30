import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

// ---------------------------------------------------------------------------
// GET /api/assistant/learning/failures
//
// Admin-only inbox of captured assistant failures (turns where the model
// apologised even after the engine's reflection retry). Sorted newest
// first; supports a basic `status` filter (open | drafted | dismissed |
// addressed | all). Returns at most 100 rows per call so the UI stays
// snappy on large installs.
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    await requirePermission("assistant:learning_review");
    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get("status") || "open").toLowerCase();
    const limit = Math.max(
      1,
      Math.min(Number(searchParams.get("limit") || 50) || 50, 100),
    );

    const where =
      statusParam === "all"
        ? {}
        : { status: statusParam };

    const rows = await prisma.assistantFailure.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
            user: { select: { id: true, name: true } },
          },
        },
        lessons: {
          select: { id: true, title: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const counts = await prisma.assistantFailure.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const summary = {
      open: counts.find((c) => c.status === "open")?._count._all ?? 0,
      drafted: counts.find((c) => c.status === "drafted")?._count._all ?? 0,
      dismissed: counts.find((c) => c.status === "dismissed")?._count._all ?? 0,
      addressed: counts.find((c) => c.status === "addressed")?._count._all ?? 0,
    };

    return NextResponse.json({
      failures: rows.map((r) => ({
        id: r.id,
        userText: r.userText,
        assistantReply: r.assistantReply,
        toolsTried: r.toolsTried,
        pageContext: r.pageContext,
        tags: r.tagsJson,
        status: r.status,
        reviewNote: r.reviewNote,
        createdAt: r.createdAt.toISOString(),
        conversation: {
          id: r.conversation.id,
          title: r.conversation.title,
          staff: r.conversation.user.name,
        },
        lessons: r.lessons.map((l) => ({ id: l.id, title: l.title, status: l.status })),
      })),
      summary,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/learning/failures", e);
    return NextResponse.json({ error: "فشل تحميل قائمة الإخفاقات" }, { status: 500 });
  }
}
