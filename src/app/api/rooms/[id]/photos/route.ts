import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";
import { saveFormFile, UploadError } from "@/lib/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("unit-photos:view");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const photos = await prisma.unitPhoto.findMany({
      where: { unitId: id },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json(photos);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/rooms/[id]/photos error:", error);
    return NextResponse.json(
      { error: "فشل جلب الصور" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("unit-photos:upload");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const unit = await prisma.unit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "الوحدة غير موجودة" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "يجب إرفاق ملف باسم 'file'" },
          { status: 400 },
        );
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json(
          { error: "يجب أن يكون الملف صورة" },
          { status: 400 },
        );
      }
      const captionAr = String(form.get("captionAr") || "") || null;
      const captionEn = String(form.get("captionEn") || "") || null;
      const isPrimary = String(form.get("isPrimary") || "") === "true";

      const saved = await saveFormFile(file);

      if (isPrimary) {
        await prisma.unitPhoto.updateMany({
          where: { unitId: id, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const maxSort = await prisma.unitPhoto.aggregate({
        where: { unitId: id },
        _max: { sortOrder: true },
      });

      const photo = await prisma.unitPhoto.create({
        data: {
          unitId: id,
          url: `stored:${saved.storagePath}`,
          captionAr,
          captionEn,
          isPrimary,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        },
      });
      return NextResponse.json(photo, { status: 201 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      captionAr?: string | null;
      captionEn?: string | null;
      isPrimary?: boolean;
    };
    const url = String(body.url || "").trim();
    if (!url) {
      return NextResponse.json({ error: "الرابط مطلوب" }, { status: 400 });
    }

    const isPrimary = Boolean(body.isPrimary);
    if (isPrimary) {
      await prisma.unitPhoto.updateMany({
        where: { unitId: id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    const maxSort = await prisma.unitPhoto.aggregate({
      where: { unitId: id },
      _max: { sortOrder: true },
    });
    const photo = await prisma.unitPhoto.create({
      data: {
        unitId: id,
        url,
        captionAr: body.captionAr || null,
        captionEn: body.captionEn || null,
        isPrimary,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/rooms/[id]/photos error:", error);
    return NextResponse.json(
      { error: "فشل رفع الصورة" },
      { status: 500 },
    );
  }
}
