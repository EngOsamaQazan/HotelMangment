import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (type) where.unitType = type;
    if (status) where.status = status;

    const units = await prisma.unit.findMany({
      where,
      orderBy: { unitNumber: "asc" },
    });

    return NextResponse.json(units);
  } catch (error) {
    console.error("GET /api/units error:", error);
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }
}
