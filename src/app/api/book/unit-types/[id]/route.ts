import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/book/unit-types/[id]
 *
 * Public details for a single unit type — powers the `/book/type/[id]`
 * landing page. Returns the type's metadata, full photo gallery, amenities
 * and textual descriptions. We only surface types marked
 * `publiclyBookable` and `isActive`.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await ctx.params;
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }

    const type = await prisma.unitType.findFirst({
      where: { id, isActive: true, publiclyBookable: true },
      include: {
        photos: {
          orderBy: [
            { isPrimary: "desc" },
            { sortOrder: "asc" },
            { id: "asc" },
          ],
        },
        amenities: {
          include: {
            amenity: {
              select: {
                id: true,
                code: true,
                nameAr: true,
                nameEn: true,
                icon: true,
                category: true,
              },
            },
          },
        },
        rooms: {
          orderBy: { position: "asc" },
          include: {
            beds: { select: { bedType: true, count: true, combinable: true } },
          },
        },
      },
    });
    if (!type) {
      return NextResponse.json(
        { error: "نوع الوحدة غير موجود" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: type.id,
      code: type.code,
      nameAr: type.nameAr,
      nameEn: type.nameEn,
      category: type.category,
      descriptionAr: type.descriptionAr,
      descriptionEn: type.descriptionEn,
      maxAdults: type.maxAdults,
      maxChildren: type.maxChildren,
      maxOccupancy: type.maxOccupancy,
      sizeSqm: type.sizeSqm,
      hasKitchen: type.hasKitchen,
      hasBalcony: type.hasBalcony,
      smokingAllowed: type.smokingAllowed,
      view: type.view,
      basePriceDaily: type.basePriceDaily,
      photos: type.photos.map((p) => ({
        id: p.id,
        url: p.url,
        captionAr: p.captionAr,
        captionEn: p.captionEn,
        isPrimary: p.isPrimary,
      })),
      amenities: type.amenities.map((a) => ({
        id: a.amenity.id,
        code: a.amenity.code,
        nameAr: a.amenity.nameAr,
        nameEn: a.amenity.nameEn,
        icon: a.amenity.icon,
        category: a.amenity.category,
      })),
      rooms: type.rooms.map((r) => ({
        id: r.id,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        kind: r.kind,
        beds: r.beds,
      })),
    });
  } catch (error) {
    console.error("GET /api/book/unit-types/[id] error:", error);
    return NextResponse.json({ error: "تعذّر جلب التفاصيل" }, { status: 500 });
  }
}
