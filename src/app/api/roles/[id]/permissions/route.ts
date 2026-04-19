import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  invalidatePermissionsCache,
} from "@/lib/permissions/guard";

/** Replace all permissions for a role. Body: { permissionIds: number[] } */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.roles:edit");
    const { id } = await params;
    const roleId = parseInt(id);
    if (isNaN(roleId))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role)
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    const body = await request.json();
    const permissionIds: number[] = Array.isArray(body.permissionIds)
      ? body.permissionIds.map((x: unknown) => Number(x)).filter(Number.isFinite)
      : [];

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true,
        });
      }
    });

    invalidatePermissionsCache();

    const updated = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: { include: { permission: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/roles/[id]/permissions error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
