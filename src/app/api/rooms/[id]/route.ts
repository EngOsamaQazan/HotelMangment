import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const unitId = parseInt(id);

    if (isNaN(unitId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    const validStatuses = ["available", "occupied", "maintenance"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await prisma.unit.update({
      where: { id: unitId },
      data: { status },
      include: {
        reservations: {
          where: { status: "active" },
          orderBy: { checkIn: "desc" },
          take: 1,
        },
      },
    });

    const activeRes = updated.reservations[0] || null;

    return NextResponse.json({
      id: updated.id,
      unitNumber: updated.unitNumber,
      type: updated.unitType,
      status: updated.status,
      floor: updated.floor,
      description: updated.description,
      guestName: activeRes?.guestName || undefined,
      phone: activeRes?.phone || undefined,
      checkInDate: activeRes?.checkIn?.toISOString() || undefined,
      checkOutDate: activeRes?.checkOut?.toISOString() || undefined,
      notes: activeRes?.notes || updated.description || undefined,
    });
  } catch (error) {
    console.error("PATCH /api/rooms/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update room status" },
      { status: 500 }
    );
  }
}
