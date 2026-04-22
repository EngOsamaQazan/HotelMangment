import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/book/merges/[id]
 *
 * Public snapshot of a merged-pair, scoped to the fields the public
 * checkout flow needs (unit numbers, capacity, photos, combined max
 * occupancy). Does NOT return any reservation / guest PII.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const mergeId = Number(id);
  if (!Number.isFinite(mergeId)) {
    return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  }

  const merge = await prisma.unitMerge.findUnique({
    where: { id: mergeId },
    include: {
      unitA: {
        select: {
          id: true,
          unitNumber: true,
          floor: true,
          unitTypeRef: {
            select: {
              id: true,
              code: true,
              nameAr: true,
              nameEn: true,
              maxAdults: true,
              maxChildren: true,
              maxOccupancy: true,
              sizeSqm: true,
              hasKitchen: true,
              hasBalcony: true,
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
        },
      },
      unitB: {
        select: {
          id: true,
          unitNumber: true,
          floor: true,
          unitTypeRef: {
            select: {
              id: true,
              code: true,
              nameAr: true,
              nameEn: true,
              maxAdults: true,
              maxChildren: true,
              maxOccupancy: true,
              sizeSqm: true,
              hasKitchen: true,
              hasBalcony: true,
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
        },
      },
    },
  });

  if (!merge) {
    return NextResponse.json(
      { error: "الشقة المدمجة غير موجودة" },
      { status: 404 },
    );
  }
  const tA = merge.unitA.unitTypeRef;
  const tB = merge.unitB.unitTypeRef;
  if (
    !tA ||
    !tB ||
    !tA.isActive ||
    !tB.isActive ||
    !tA.publiclyBookable ||
    !tB.publiclyBookable
  ) {
    return NextResponse.json(
      { error: "الشقة المدمجة غير متاحة للحجز عبر الموقع" },
      { status: 404 },
    );
  }

  const hero = tA.photos[0] ?? tB.photos[0] ?? null;

  return NextResponse.json({
    mergeId: merge.id,
    unitA: {
      id: merge.unitA.id,
      unitNumber: merge.unitA.unitNumber,
      floor: merge.unitA.floor,
      unitTypeNameAr: tA.nameAr,
    },
    unitB: {
      id: merge.unitB.id,
      unitNumber: merge.unitB.unitNumber,
      floor: merge.unitB.floor,
      unitTypeNameAr: tB.nameAr,
    },
    nameAr: `شقة عائليّة · ${merge.unitA.unitNumber} + ${merge.unitB.unitNumber}`,
    nameEn: `Family suite · ${merge.unitA.unitNumber} + ${merge.unitB.unitNumber}`,
    maxAdults: tA.maxAdults + tB.maxAdults,
    maxChildren: tA.maxChildren + tB.maxChildren,
    maxOccupancy: tA.maxOccupancy + tB.maxOccupancy,
    sizeSqm:
      tA.sizeSqm != null && tB.sizeSqm != null ? tA.sizeSqm + tB.sizeSqm : null,
    hasKitchen: tA.hasKitchen || tB.hasKitchen,
    hasBalcony: tA.hasBalcony || tB.hasBalcony,
    primaryPhotoUrl: hero?.url ?? null,
    primaryPhotoId: hero?.id ?? null,
  });
}
