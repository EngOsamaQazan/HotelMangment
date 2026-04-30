import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET() {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);

    const rows = await prisma.assistantConversation.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        lastMessageAt: true,
        llmTurns: true,
        costUsdTotal: true,
      },
    });

    return NextResponse.json({
      conversations: rows.map((r) => ({
        ...r,
        costUsdTotal: Number(r.costUsdTotal),
      })),
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/conversations", e);
    return NextResponse.json({ error: "فشل تحميل المحادثات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);

    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const title = (body.title ?? "").trim().slice(0, 80) || "محادثة جديدة";

    const conv = await prisma.assistantConversation.create({
      data: { userId, title },
      select: {
        id: true,
        title: true,
        createdAt: true,
        lastMessageAt: true,
        llmTurns: true,
        costUsdTotal: true,
      },
    });

    return NextResponse.json(
      { ...conv, costUsdTotal: Number(conv.costUsdTotal) },
      { status: 201 },
    );
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/conversations", e);
    return NextResponse.json({ error: "فشل إنشاء المحادثة" }, { status: 500 });
  }
}
