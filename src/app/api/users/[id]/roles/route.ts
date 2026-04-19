import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  invalidatePermissionsCache,
} from "@/lib/permissions/guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.users:view");
    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const rows = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return NextResponse.json({
      roles: rows.map((r) => r.role),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/users/[id]/roles error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/** Replace user's roles. Body: { roleIds: number[] } */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.users:edit");
    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing)
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

    const body = await request.json();
    const roleIds: number[] = Array.isArray(body.roleIds)
      ? body.roleIds.map((x: unknown) => Number(x)).filter(Number.isFinite)
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId, roleId })),
          skipDuplicates: true,
        });
      }

      // Keep legacy `user.role` column in sync with the first role key
      if (roleIds.length > 0) {
        const first = await tx.role.findUnique({ where: { id: roleIds[0] } });
        if (first) {
          await tx.user.update({
            where: { id: userId },
            data: { role: first.key },
          });
        }
      }
    });

    invalidatePermissionsCache(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/users/[id]/roles error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
