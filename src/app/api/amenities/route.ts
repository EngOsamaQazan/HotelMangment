import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";

export async function GET() {
  try {
    await requirePermission("settings.unit_types:view");
    const amenities = await prisma.amenity.findMany({
      orderBy: [{ category: "asc" }, { nameAr: "asc" }],
    });
    return NextResponse.json(amenities);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/amenities error:", error);
    return NextResponse.json({ error: "Failed to fetch amenities" }, { status: 500 });
  }
}
