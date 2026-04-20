import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

const DEFAULT_COLUMNS = [
  { name: "قائمة الانتظار", position: 0 },
  { name: "قيد التنفيذ", position: 1 },
  { name: "قيد المراجعة", position: 2 },
  { name: "مكتمل", position: 3 },
];

/** List boards the caller owns or is a member of. */
export async function GET() {
  try {
    const session = await requirePermission("tasks.boards:view");
    const userId = Number((session.user as { id?: string | number }).id);

    const boards = await prisma.taskBoard.findMany({
      where: {
        archivedAt: null,
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true, members: true } },
        members: {
          select: {
            user: { select: { id: true, name: true, email: true } },
            role: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(boards);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/tasks/boards error:", error);
    return NextResponse.json(
      { error: "فشل تحميل اللوحات" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("tasks.boards:create");
    const userId = Number((session.user as { id?: string | number }).id);
    const body = await request.json().catch(() => ({}));
    const { name, description, color, memberIds } = body as {
      name?: string;
      description?: string;
      color?: string;
      memberIds?: number[];
    };
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "اسم اللوحة مطلوب" },
        { status: 400 },
      );
    }

    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.taskBoard.create({
        data: {
          name: name.trim(),
          description: description?.trim() || null,
          color: color || null,
          ownerId: userId,
        },
      });
      await tx.taskColumn.createMany({
        data: DEFAULT_COLUMNS.map((c) => ({
          boardId: created.id,
          name: c.name,
          position: c.position,
        })),
      });
      await tx.taskBoardMember.create({
        data: { boardId: created.id, userId, role: "owner" },
      });
      if (Array.isArray(memberIds) && memberIds.length) {
        const unique = Array.from(
          new Set(memberIds.filter((id) => Number.isFinite(id) && id !== userId)),
        );
        if (unique.length) {
          await tx.taskBoardMember.createMany({
            data: unique.map((uid) => ({
              boardId: created.id,
              userId: uid,
              role: "editor",
            })),
            skipDuplicates: true,
          });
        }
      }
      return tx.taskBoard.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { tasks: true, members: true } },
        },
      });
    });

    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/tasks/boards error:", error);
    return NextResponse.json(
      { error: "فشل إنشاء اللوحة" },
      { status: 500 },
    );
  }
}
