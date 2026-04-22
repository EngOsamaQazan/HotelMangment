import "server-only";
import { prisma } from "@/lib/prisma";
import { countNights } from "./pricing";

/**
 * Public-side availability engine.
 *
 * Returns, per `UnitType`, how many physical units are free for the
 * requested window. A unit is "free" when:
 *  - its status is NOT "maintenance" AND
 *  - it has no reservation whose date range overlaps [checkIn, checkOut)
 *    AND whose status ∈ { active, upcoming, pending_hold (unexpired) }.
 *
 * This module intentionally does NOT expose guest PII to the caller — it
 * returns only aggregate counts per type plus a representative unit id
 * that the hold endpoint can lock. That keeps the public API safe from
 * scraping concrete reservation data.
 */

export interface UnitTypeAvailability {
  unitTypeId: number;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm: number | null;
  hasKitchen: boolean;
  hasBalcony: boolean;
  view: string | null;
  basePriceDaily: number | null;
  availableCount: number;
  /** A free-unit id that callers can lock via createHold. null if none. */
  firstAvailableUnitId: number | null;
  /** A hero/primary photo URL (UnitTypePhoto.isPrimary first, then sortOrder). */
  primaryPhotoUrl: string | null;
  /** The primary photo's id, so the client can call /api/files/unit-type-photo/<id>. */
  primaryPhotoId: number | null;
}

export interface AvailabilityInput {
  checkIn: Date;
  checkOut: Date;
  guests: number;
}

export async function findAvailableUnitTypes(
  input: AvailabilityInput,
): Promise<UnitTypeAvailability[]> {
  const { checkIn, checkOut, guests } = input;
  if (checkOut <= checkIn) return [];
  const nights = countNights(checkIn, checkOut);
  if (nights <= 0) return [];

  const now = new Date();

  const types = await prisma.unitType.findMany({
    where: {
      isActive: true,
      publiclyBookable: true,
      maxOccupancy: { gte: guests > 0 ? guests : 1 },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      photos: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
        take: 1,
        select: { id: true, url: true },
      },
      units: {
        where: {
          status: { not: "maintenance" },
        },
        select: {
          id: true,
          unitNumber: true,
          reservations: {
            where: {
              OR: [
                { status: { in: ["active", "upcoming"] } },
                {
                  status: "pending_hold",
                  holdExpiresAt: { gt: now },
                },
              ],
              checkIn: { lt: checkOut },
              checkOut: { gt: checkIn },
            },
            select: { id: true },
          },
        },
      },
    },
  });

  return types.map((t) => {
    const free = t.units.filter((u) => u.reservations.length === 0);
    const hero = t.photos[0] ?? null;
    return {
      unitTypeId: t.id,
      code: t.code,
      nameAr: t.nameAr,
      nameEn: t.nameEn,
      category: t.category,
      maxAdults: t.maxAdults,
      maxChildren: t.maxChildren,
      maxOccupancy: t.maxOccupancy,
      sizeSqm: t.sizeSqm,
      hasKitchen: t.hasKitchen,
      hasBalcony: t.hasBalcony,
      view: t.view ?? null,
      basePriceDaily: t.basePriceDaily,
      availableCount: free.length,
      firstAvailableUnitId: free[0]?.id ?? null,
      primaryPhotoUrl: hero?.url ?? null,
      primaryPhotoId: hero?.id ?? null,
    };
  });
}

/** Asserts a specific unit is still bookable — used by the hold endpoint. */
export async function isUnitFree(params: {
  unitId: number;
  checkIn: Date;
  checkOut: Date;
}): Promise<boolean> {
  const { unitId, checkIn, checkOut } = params;
  const now = new Date();
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true, status: true, unitTypeId: true },
  });
  if (!unit || unit.status === "maintenance") return false;

  const conflict = await prisma.reservation.findFirst({
    where: {
      unitId,
      OR: [
        { status: { in: ["active", "upcoming"] } },
        { status: "pending_hold", holdExpiresAt: { gt: now } },
      ],
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { id: true },
  });
  return !conflict;
}
