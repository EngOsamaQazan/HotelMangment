import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireConversationAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function POST(
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
        { error: "المشرف فقط يمكنه إضافة أعضاء" },
        { status: 403 },
      );
    }
    const body = await request.json().catch(() => ({}));
    const { userIds } = body as { userIds?: number[] };
    if (!Array.isArray(userIds) || !userIds.length) {
      return NextResponse.json(
        { error: "قائمة المستخدمين مطلوبة" },
        { status: 400 },
      );
    }
    const uniq = Array.from(new Set(userIds.filter(Number.isFinite)));
    await prisma.chatParticipant.createMany({
      data: uniq.map((uid) => ({ conversationId, userId: uid })),
      skipDuplicates: true,
    });
    const parts = await prisma.chatParticipant.findMany({
      where: { conversationId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
    return NextResponse.json(parts, { status: 201 });
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
    console.error("POST participants error:", error);
    return NextResponse.json(
      { error: "فشل إضافة المشاركين" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
    const { searchParams } = new URL(request.url);
    const removeUserId = Number(searchParams.get("userId"));
    if (!Number.isFinite(removeUserId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    // Non-admins can only remove themselves (leave conversation)
    if (me.role !== "admin" && removeUserId !== userId) {
      return NextResponse.json(
        { error: "المشرف فقط يمكنه إزالة الأعضاء" },
        { status: 403 },
      );
    }
    await prisma.chatParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId: removeUserId },
      },
      data: { leftAt: new Date() },
    });
    return NextResponse.json({ ok: true });
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
    console.error("DELETE participants error:", error);
    return NextResponse.json(
      { error: "فشل إزالة المشارك" },
      { status: 500 },
    );
  }
}
