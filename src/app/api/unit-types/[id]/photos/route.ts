import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";
import { saveFormFile, UploadError } from "@/lib/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.unit_types:view");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const photos = await prisma.unitTypePhoto.findMany({
      where: { unitTypeId: id },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    });
    return NextResponse.json(photos);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/unit-types/[id]/photos error:", error);
    return NextResponse.json({ error: "Failed to fetch photos" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.unit_types:edit");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const unitType = await prisma.unitType.findUnique({ where: { id }, select: { id: true } });
    if (!unitType) return NextResponse.json({ error: "نوع الوحدة غير موجود" }, { status: 404 });

    const contentType = request.headers.get("content-type") || "";

    // Two modes: multipart (upload file) or JSON (external URL)
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "يجب إرفاق ملف باسم 'file'" }, { status: 400 });
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "يجب أن يكون الملف صورة" }, { status: 400 });
      }
      const captionAr = String(form.get("captionAr") || "") || null;
      const captionEn = String(form.get("captionEn") || "") || null;
      const isPrimary = String(form.get("isPrimary") || "") === "true";

      const saved = await saveFormFile(file);

      // If isPrimary, reset previous primary for this type
      if (isPrimary) {
        await prisma.unitTypePhoto.updateMany({
          where: { unitTypeId: id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const maxSort = await prisma.unitTypePhoto.aggregate({
        where: { unitTypeId: id },
        _max: { sortOrder: true },
      });

      const photo = await prisma.unitTypePhoto.create({
        data: {
          unitTypeId: id,
          url: `stored:${saved.storagePath}`,
          captionAr,
          captionEn,
          isPrimary,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        },
      });

      return NextResponse.json(photo, { status: 201 });
    } else {
      const body = await request.json();
      const url = String(body.url || "").trim();
      if (!url) return NextResponse.json({ error: "الرابط مطلوب" }, { status: 400 });

      const isPrimary = Boolean(body.isPrimary);
      if (isPrimary) {
        await prisma.unitTypePhoto.updateMany({
          where: { unitTypeId: id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const maxSort = await prisma.unitTypePhoto.aggregate({
        where: { unitTypeId: id },
        _max: { sortOrder: true },
      });

      const photo = await prisma.unitTypePhoto.create({
        data: {
          unitTypeId: id,
          url,
          captionAr: body.captionAr || null,
          captionEn: body.captionEn || null,
          isPrimary,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        },
      });
      return NextResponse.json(photo, { status: 201 });
    }
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/unit-types/[id]/photos error:", error);
    return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
  }
}
