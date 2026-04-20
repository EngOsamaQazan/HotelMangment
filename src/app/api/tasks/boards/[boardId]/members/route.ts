import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { requireBoardAccess } from "@/lib/tasks/access";

function errStatus(e: unknown): number {
  return typeof e === "object" && e && "status" in e
    ? (e as { status: number }).status
    : 500;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.boards:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const { boardId: raw } = await params;
    const boardId = Number(raw);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireBoardAccess(boardId, userId, "viewer");
    const members = await prisma.taskBoardMember.findMany({
      where: { boardId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(members);
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
    console.error("GET members error:", error);
    return NextResponse.json({ error: "فشل تحميل الأعضاء" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.boards:manage_members");
    const userId = Number((session.user as { id?: string | number }).id);
    const { boardId: raw } = await params;
    const boardId = Number(raw);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireBoardAccess(boardId, userId, "owner");

    const body = await request.json().catch(() => ({}));
    const { userIds, role } = body as {
      userIds?: number[];
      role?: string;
    };
    if (!Array.isArray(userIds) || !userIds.length) {
      return NextResponse.json(
        { error: "قائمة المستخدمين مطلوبة" },
        { status: 400 },
      );
    }
    const roleKey =
      role === "owner" || role === "editor" || role === "viewer"
        ? role
        : "editor";
    const unique = Array.from(
      new Set(userIds.filter((id) => Number.isFinite(id))),
    );
    await prisma.taskBoardMember.createMany({
      data: unique.map((uid) => ({ boardId, userId: uid, role: roleKey })),
      skipDuplicates: true,
    });
    const members = await prisma.taskBoardMember.findMany({
      where: { boardId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json(members, { status: 201 });
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
    console.error("POST members error:", error);
    return NextResponse.json({ error: "فشل إضافة الأعضاء" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.boards:manage_members");
    const userId = Number((session.user as { id?: string | number }).id);
    const { boardId: raw } = await params;
    const boardId = Number(raw);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireBoardAccess(boardId, userId, "owner");
    const body = await request.json().catch(() => ({}));
    const { memberId, role } = body as { memberId?: number; role?: string };
    if (!Number.isFinite(memberId)) {
      return NextResponse.json(
        { error: "معرف العضو مطلوب" },
        { status: 400 },
      );
    }
    if (!["owner", "editor", "viewer"].includes(role || "")) {
      return NextResponse.json({ error: "دور غير صالح" }, { status: 400 });
    }
    const updated = await prisma.taskBoardMember.update({
      where: { id: memberId },
      data: { role },
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
    console.error("PATCH members error:", error);
    return NextResponse.json({ error: "فشل تحديث الدور" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> },
) {
  try {
    const session = await requirePermission("tasks.boards:manage_members");
    const userId = Number((session.user as { id?: string | number }).id);
    const { boardId: raw } = await params;
    const boardId = Number(raw);
    if (!Number.isFinite(boardId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await requireBoardAccess(boardId, userId, "owner");
    const { searchParams } = new URL(request.url);
    const memberUserId = Number(searchParams.get("userId"));
    if (!Number.isFinite(memberUserId)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }
    await prisma.taskBoardMember.deleteMany({
      where: { boardId, userId: memberUserId },
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
    console.error("DELETE members error:", error);
    return NextResponse.json({ error: "فشل إزالة العضو" }, { status: 500 });
  }
}
