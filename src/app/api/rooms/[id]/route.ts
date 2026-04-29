import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { legacyTypeFromUnitTypeRef } from "@/lib/units/legacy-type";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("rooms:edit");
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
    const { status, bedSetup, notes, unitTypeId, bookingRoomCode } = body;

    const updateData: Record<string, unknown> = {};

    if (status !== undefined) {
      const validStatuses = ["available", "occupied", "maintenance"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    if (bedSetup !== undefined) {
      const validSetups = ["default", "combined", "separated"];
      if (!validSetups.includes(bedSetup)) {
        return NextResponse.json(
          { error: `Invalid bedSetup` },
          { status: 400 },
        );
      }
      updateData.bedSetup = bedSetup;
    }

    if (notes !== undefined) updateData.notes = notes;
    if (bookingRoomCode !== undefined) updateData.bookingRoomCode = bookingRoomCode || null;

    if (unitTypeId !== undefined && unitTypeId !== null) {
      const typeExists = await prisma.unitType.findUnique({
        where: { id: Number(unitTypeId) },
        select: { id: true },
      });
      if (!typeExists) {
        return NextResponse.json(
          { error: "نوع الوحدة المحدد غير موجود" },
          { status: 400 },
        );
      }
      updateData.unitTypeId = typeExists.id;
    }

    const updated = await prisma.unit.update({
      where: { id: unitId },
      data: updateData,
      include: {
        reservations: {
          where: { status: "active" },
          orderBy: { checkIn: "desc" },
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
    });

    const activeRes = updated.reservations[0] || null;

    return NextResponse.json({
      id: updated.id,
      unitNumber: updated.unitNumber,
      type: legacyTypeFromUnitTypeRef(updated.unitTypeRef),
      unitTypeId: updated.unitTypeId,
      unitType: updated.unitTypeRef
        ? {
            id: updated.unitTypeRef.id,
            code: updated.unitTypeRef.code,
            nameAr: updated.unitTypeRef.nameAr,
            nameEn: updated.unitTypeRef.nameEn,
            category: updated.unitTypeRef.category,
            maxAdults: updated.unitTypeRef.maxAdults,
            maxOccupancy: updated.unitTypeRef.maxOccupancy,
            hasKitchen: updated.unitTypeRef.hasKitchen,
            hasBalcony: updated.unitTypeRef.hasBalcony,
            rooms: updated.unitTypeRef.rooms,
          }
        : null,
      status: updated.status,
      floor: updated.floor,
      description: updated.description,
      bedSetup: updated.bedSetup,
      notes: updated.notes,
      bookingRoomCode: updated.bookingRoomCode,
      guestName: activeRes?.guestName || undefined,
      phone: activeRes?.phone || undefined,
      checkInDate: activeRes?.checkIn?.toISOString() || undefined,
      checkOutDate: activeRes?.checkOut?.toISOString() || undefined,
      reservationNotes: activeRes?.notes || undefined,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/rooms/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}
