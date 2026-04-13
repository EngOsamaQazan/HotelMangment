import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const units = await prisma.unit.findMany({
      include: {
        reservations: {
          where: { status: "active" },
          orderBy: { checkIn: "desc" },
          take: 1,
        },
        maintenance: {
          where: { status: { not: "completed" } },
          orderBy: { requestDate: "desc" },
          take: 1,
        },
      },
      orderBy: [{ floor: "asc" }, { unitNumber: "asc" }],
    });

    const result = units.map((unit) => {
      const activeRes = unit.reservations[0] || null;
      return {
        id: unit.id,
        unitNumber: unit.unitNumber,
        type: unit.unitType,
        status: unit.status,
        floor: unit.floor,
        description: unit.description,
        guestName: activeRes?.guestName || undefined,
        phone: activeRes?.phone || undefined,
        checkInDate: activeRes?.checkIn?.toISOString() || undefined,
        checkOutDate: activeRes?.checkOut?.toISOString() || undefined,
        notes: activeRes?.notes || unit.description || undefined,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/rooms error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rooms" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, status, description } = body;

    if (!id) {
      return NextResponse.json({ error: "Unit ID is required" }, { status: 400 });
    }

    const unit = await prisma.unit.findUnique({ where: { id } });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const validStatuses = ["available", "occupied", "maintenance"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: { status?: "available" | "occupied" | "maintenance"; description?: string } = {};
    if (status !== undefined) updateData.status = status;
    if (description !== undefined) updateData.description = description;

    const updated = await prisma.unit.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/rooms error:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}
