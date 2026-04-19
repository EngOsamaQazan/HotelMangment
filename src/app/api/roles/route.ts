import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  invalidatePermissionsCache,
} from "@/lib/permissions/guard";

export async function GET() {
  try {
    await requirePermission("settings.roles:view");
    const roles = await prisma.role.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { users: true, permissions: true } },
      },
    });
    return NextResponse.json({ roles });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/roles error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("settings.roles:create");
    const body = await request.json();
    const { key, name, description, permissionIds } = body;

    if (!key || !name) {
      return NextResponse.json(
        { error: "key و name مطلوبان" },
        { status: 400 },
      );
    }

    const existing = await prisma.role.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json(
        { error: "المفتاح مستخدم مسبقاً" },
        { status: 409 },
      );
    }

    const role = await prisma.$transaction(async (tx) => {
      const r = await tx.role.create({
        data: {
          key,
          name,
          description: description ?? null,
          isSystem: false,
        },
      });
      if (Array.isArray(permissionIds) && permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((id: number) => ({
            roleId: r.id,
            permissionId: Number(id),
          })),
          skipDuplicates: true,
        });
      }
      return r;
    });

    invalidatePermissionsCache();
    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/roles error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
