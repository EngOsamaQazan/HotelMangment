import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("guests:view");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const where = search
      ? {
          OR: [
            { fullName: { contains: search } },
            { idNumber: { contains: search } },
          ],
        }
      : {};

    const guests = await prisma.guest.findMany({
      where,
      include: {
        reservation: {
          include: { unit: true },
        },
      },
      orderBy: { id: "desc" },
    });

    return NextResponse.json(guests);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/guests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch guests" },
      { status: 500 }
    );
  }
}
