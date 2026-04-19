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
    await requirePermission("settings.roles:view");
    const { id } = await params;
    const roleId = parseInt(id);
    if (isNaN(roleId))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const role = await prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: {
            permission: { include: { resource: true } },
          },
        },
        users: {
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!role)
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    return NextResponse.json(role);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/roles/[id] error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.roles:edit");
    const { id } = await params;
    const roleId = parseInt(id);
    if (isNaN(roleId))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing)
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    const body = await request.json();
    const { name, description, isActive } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) {
      if (existing.isSystem && !isActive) {
        return NextResponse.json(
          { error: "لا يمكن تعطيل دور نظامي" },
          { status: 400 },
        );
      }
      data.isActive = isActive;
    }

    const role = await prisma.role.update({
      where: { id: roleId },
      data,
    });

    invalidatePermissionsCache();
    return NextResponse.json(role);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/roles/[id] error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.roles:delete");
    const { id } = await params;
    const roleId = parseInt(id);
    if (isNaN(roleId))
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    const existing = await prisma.role.findUnique({ where: { id: roleId } });
    if (!existing)
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    if (existing.isSystem) {
      return NextResponse.json(
        { error: "لا يمكن حذف دور نظامي" },
        { status: 400 },
      );
    }

    await prisma.role.delete({ where: { id: roleId } });
    invalidatePermissionsCache();
    return NextResponse.json({ message: "تم الحذف" });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/roles/[id] error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
