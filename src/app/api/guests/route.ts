import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
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
    console.error("GET /api/guests error:", error);
    return NextResponse.json(
      { error: "Failed to fetch guests" },
      { status: 500 }
    );
  }
}
