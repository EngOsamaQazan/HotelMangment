import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/** List all active resources with their permissions — used by the roles matrix UI. */
export async function GET() {
  try {
    await requirePermission("settings.roles:view");
    const resources = await prisma.resource.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { key: "asc" }],
      include: {
        permissions: {
          where: { isActive: true },
          orderBy: { id: "asc" },
        },
      },
    });
    return NextResponse.json({ resources });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/permissions error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
