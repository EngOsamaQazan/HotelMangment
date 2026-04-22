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

/**
 * Represents a merged-pair listing surfaced to guests on `/book`.
 *
 * A merged pair combines two neighbouring `Unit` records (with an adjoining
 * side door) into a single family-apartment offer. Price = sum of each
 * unit's `basePriceDaily` (or fallback). Capacity = sum of `maxOccupancy`.
 */
export interface MergedPairAvailability {
  mergeId: number;
  unitAId: number;
  unitBId: number;
  unitANumber: string;
  unitBNumber: string;
  unitTypeCodes: string[];
  unitTypeNamesAr: string[];
  maxOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  sizeSqm: number | null;
  hasKitchen: boolean;
  hasBalcony: boolean;
  basePriceDaily: number | null;
  primaryPhotoUrl: string | null;
  primaryPhotoId: number | null;
}

/**
 * Find merged pairs where BOTH sides are free in [checkIn, checkOut) and
 * the combined capacity accommodates `guests`.
 *
 * The guest-count threshold that decides whether to surface merged pairs
 * at all is applied by the caller (API route) — this function assumes the
 * caller already wants merged offers.
 */
export async function findAvailableMergedPairs(
  input: AvailabilityInput,
): Promise<MergedPairAvailability[]> {
  const { checkIn, checkOut, guests } = input;
  if (checkOut <= checkIn) return [];
  const now = new Date();

  const pairs = await prisma.unitMerge.findMany({
    include: {
      unitA: {
        select: {
          id: true,
          unitNumber: true,
          status: true,
          unitTypeRef: {
            select: {
              code: true,
              nameAr: true,
              maxAdults: true,
              maxChildren: true,
              maxOccupancy: true,
              sizeSqm: true,
              hasKitchen: true,
              hasBalcony: true,
              basePriceDaily: true,
              isActive: true,
              publiclyBookable: true,
              photos: {
                orderBy: [
                  { isPrimary: "desc" },
                  { sortOrder: "asc" },
                  { id: "asc" },
                ],
                take: 1,
                select: { id: true, url: true },
              },
            },
          },
          reservations: {
            where: {
              OR: [
                { status: { in: ["active", "upcoming"] } },
                { status: "pending_hold", holdExpiresAt: { gt: now } },
              ],
              checkIn: { lt: checkOut },
              checkOut: { gt: checkIn },
            },
            select: { id: true },
          },
        },
      },
      unitB: {
        select: {
          id: true,
          unitNumber: true,
          status: true,
          unitTypeRef: {
            select: {
              code: true,
              nameAr: true,
              maxAdults: true,
              maxChildren: true,
              maxOccupancy: true,
              sizeSqm: true,
              hasKitchen: true,
              hasBalcony: true,
              basePriceDaily: true,
              isActive: true,
              publiclyBookable: true,
              photos: {
                orderBy: [
                  { isPrimary: "desc" },
                  { sortOrder: "asc" },
                  { id: "asc" },
                ],
                take: 1,
                select: { id: true, url: true },
              },
            },
          },
          reservations: {
            where: {
              OR: [
                { status: { in: ["active", "upcoming"] } },
                { status: "pending_hold", holdExpiresAt: { gt: now } },
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

  const result: MergedPairAvailability[] = [];
  for (const p of pairs) {
    const a = p.unitA;
    const b = p.unitB;
    if (a.status === "maintenance" || b.status === "maintenance") continue;
    if (a.reservations.length > 0 || b.reservations.length > 0) continue;

    const tA = a.unitTypeRef;
    const tB = b.unitTypeRef;
    if (!tA || !tB) continue;
    if (!tA.isActive || !tB.isActive) continue;
    // Surface the pair publicly only when both sides are individually
    // bookable; if an admin hid one side, the merged offer is also hidden.
    if (!tA.publiclyBookable || !tB.publiclyBookable) continue;

    const maxOccupancy = tA.maxOccupancy + tB.maxOccupancy;
    if (guests > maxOccupancy) continue;

    const priceA = tA.basePriceDaily;
    const priceB = tB.basePriceDaily;
    const base =
      priceA != null && priceB != null ? Number(priceA) + Number(priceB) : null;

    const hero = tA.photos[0] ?? tB.photos[0] ?? null;

    result.push({
      mergeId: p.id,
      unitAId: a.id,
      unitBId: b.id,
      unitANumber: a.unitNumber,
      unitBNumber: b.unitNumber,
      unitTypeCodes: [tA.code, tB.code],
      unitTypeNamesAr: [tA.nameAr, tB.nameAr],
      maxOccupancy,
      maxAdults: tA.maxAdults + tB.maxAdults,
      maxChildren: tA.maxChildren + tB.maxChildren,
      sizeSqm:
        tA.sizeSqm != null && tB.sizeSqm != null
          ? tA.sizeSqm + tB.sizeSqm
          : null,
      hasKitchen: tA.hasKitchen || tB.hasKitchen,
      hasBalcony: tA.hasBalcony || tB.hasBalcony,
      basePriceDaily: base,
      primaryPhotoUrl: hero?.url ?? null,
      primaryPhotoId: hero?.id ?? null,
    });
  }
  return result;
}

/** Asserts a merge pair (both units) is still fully bookable. */
export async function isMergedPairFree(params: {
  mergeId: number;
  checkIn: Date;
  checkOut: Date;
}): Promise<boolean> {
  const { mergeId, checkIn, checkOut } = params;
  const merge = await prisma.unitMerge.findUnique({
    where: { id: mergeId },
    select: { unitAId: true, unitBId: true },
  });
  if (!merge) return false;
  const [aOk, bOk] = await Promise.all([
    isUnitFree({ unitId: merge.unitAId, checkIn, checkOut }),
    isUnitFree({ unitId: merge.unitBId, checkIn, checkOut }),
  ]);
  return aOk && bOk;
}
