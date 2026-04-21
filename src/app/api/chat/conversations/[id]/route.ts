import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireConversationAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("chat:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id: raw } = await params;
    const conversationId = Number(raw);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireConversationAccess(conversationId, userId);
    const conv = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
          },
        },
        task: { select: { id: true, title: true, boardId: true } },
      },
    });
    return NextResponse.json(conv);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    const status = errStatus(error);
    if (status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    console.error("GET conversation error:", error);
    return NextResponse.json(
      { error: "فشل تحميل المحادثة" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("chat:create");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id: raw } = await params;
    const conversationId = Number(raw);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    const me = await requireConversationAccess(conversationId, userId);
    if (me.role !== "admin") {
      return NextResponse.json(
        { error: "المشرف فقط يمكنه التعديل" },
        { status: 403 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const { title } = body as { title?: string };
    const updated = await prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        title: typeof title === "string" ? (title.trim() || null) : undefined,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    const status = errStatus(error);
    if (status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 403 },
      );
    }
    console.error("PATCH conversation error:", error);
    return NextResponse.json(
      { error: "فشل تحديث المحادثة" },
      { status: 500 },
    );
  }
}
