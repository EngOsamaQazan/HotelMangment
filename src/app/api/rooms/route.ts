import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET() {
  try {
    await requirePermission("rooms:view");
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
        unitTypeRef: {
          include: {
            rooms: {
              orderBy: { position: "asc" },
              include: { beds: true },
            },
          },
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
        unitTypeId: unit.unitTypeId,
        unitType: unit.unitTypeRef
          ? {
              id: unit.unitTypeRef.id,
              code: unit.unitTypeRef.code,
              nameAr: unit.unitTypeRef.nameAr,
              nameEn: unit.unitTypeRef.nameEn,
              category: unit.unitTypeRef.category,
              maxAdults: unit.unitTypeRef.maxAdults,
              maxOccupancy: unit.unitTypeRef.maxOccupancy,
              hasKitchen: unit.unitTypeRef.hasKitchen,
              hasBalcony: unit.unitTypeRef.hasBalcony,
              rooms: unit.unitTypeRef.rooms,
            }
          : null,
        status: unit.status,
        floor: unit.floor,
        description: unit.description,
        bedSetup: unit.bedSetup,
        notes: unit.notes,
        bookingRoomCode: unit.bookingRoomCode,
        guestName: activeRes?.guestName || undefined,
        phone: activeRes?.phone || undefined,
        checkInDate: activeRes?.checkIn?.toISOString() || undefined,
        checkOutDate: activeRes?.checkOut?.toISOString() || undefined,
        reservationNotes: activeRes?.notes || undefined,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/rooms error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rooms" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requirePermission("rooms:edit");
    const body = await request.json();
    const { id, status, description, unitTypeId, bedSetup, notes, bookingRoomCode } = body;

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

    const validSetups = ["default", "combined", "separated"];
    if (bedSetup && !validSetups.includes(bedSetup)) {
      return NextResponse.json(
        { error: `Invalid bedSetup. Must be one of: ${validSetups.join(", ")}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (description !== undefined) updateData.description = description;
    if (bedSetup !== undefined) updateData.bedSetup = bedSetup;
    if (notes !== undefined) updateData.notes = notes;
    if (bookingRoomCode !== undefined) updateData.bookingRoomCode = bookingRoomCode || null;

    if (unitTypeId !== undefined) {
      if (unitTypeId !== null) {
        const typeExists = await prisma.unitType.findUnique({
          where: { id: Number(unitTypeId) },
          select: { id: true, category: true },
        });
        if (!typeExists) {
          return NextResponse.json(
            { error: "نوع الوحدة المحدد غير موجود" },
            { status: 400 },
          );
        }
        updateData.unitTypeId = typeExists.id;
        // Keep legacy unitType string in sync (room | apartment)
        updateData.unitType = typeExists.category === "apartment" ? "apartment" : "room";
      }
    }

    const updated = await prisma.unit.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/rooms error:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}
