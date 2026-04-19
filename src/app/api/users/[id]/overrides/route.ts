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

    const overrides = await prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: { include: { resource: true } } },
    });
    return NextResponse.json({ overrides });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/users/[id]/overrides error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * Replace user's overrides.
 * Body: { overrides: Array<{ permissionId: number; effect: "allow" | "deny" }> }
 */
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

    const body = await request.json();
    const items = Array.isArray(body.overrides) ? body.overrides : [];

    const clean = items
      .map((o: { permissionId?: unknown; effect?: unknown }) => ({
        permissionId: Number(o.permissionId),
        effect: String(o.effect),
      }))
      .filter(
        (o: { permissionId: number; effect: string }) =>
          Number.isFinite(o.permissionId) &&
          (o.effect === "allow" || o.effect === "deny"),
      );

    await prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId } });
      if (clean.length > 0) {
        await tx.userPermissionOverride.createMany({
          data: clean.map((o: { permissionId: number; effect: string }) => ({
            userId,
            permissionId: o.permissionId,
            effect: o.effect,
          })),
          skipDuplicates: true,
        });
      }
    });

    invalidatePermissionsCache(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/users/[id]/overrides error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
