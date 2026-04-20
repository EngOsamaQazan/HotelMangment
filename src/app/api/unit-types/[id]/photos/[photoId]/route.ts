import { NextResponse } from "next/server";
import fs from "fs/promises";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";
import { deleteStoredFile, resolveStoragePath } from "@/lib/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requirePermission("settings.unit_types:view");
    const { id: idStr, photoId: photoIdStr } = await params;
    const id = Number(idStr);
    const photoId = Number(photoIdStr);
    if (!Number.isFinite(id) || !Number.isFinite(photoId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const photo = await prisma.unitTypePhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.unitTypeId !== id) {
      return NextResponse.json({ error: "الصورة غير موجودة" }, { status: 404 });
    }

    if (!photo.url.startsWith("stored:")) {
      // External URL — redirect
      return NextResponse.redirect(photo.url);
    }

    const storagePath = photo.url.slice("stored:".length);
    const abs = resolveStoragePath(storagePath);
    const buf = await fs.readFile(abs);
    const ext = storagePath.split(".").pop()?.toLowerCase() || "jpg";
    const mime =
      ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/jpeg";

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/unit-types/[id]/photos/[photoId] error:", error);
    return NextResponse.json({ error: "فشل تحميل الصورة" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requirePermission("settings.unit_types:edit");
    const { id: idStr, photoId: photoIdStr } = await params;
    const id = Number(idStr);
    const photoId = Number(photoIdStr);
    if (!Number.isFinite(id) || !Number.isFinite(photoId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const photo = await prisma.unitTypePhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.unitTypeId !== id) {
      return NextResponse.json({ error: "الصورة غير موجودة" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    if (body.captionAr !== undefined) updateData.captionAr = body.captionAr;
    if (body.captionEn !== undefined) updateData.captionEn = body.captionEn;
    if (body.sortOrder !== undefined) updateData.sortOrder = Number(body.sortOrder);
    if (body.isPrimary === true) {
      await prisma.unitTypePhoto.updateMany({
        where: { unitTypeId: id, isPrimary: true, NOT: { id: photoId } },
        data: { isPrimary: false },
      });
      updateData.isPrimary = true;
    } else if (body.isPrimary === false) {
      updateData.isPrimary = false;
    }

    const updated = await prisma.unitTypePhoto.update({
      where: { id: photoId },
      data: updateData,
    });
    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/unit-types/[id]/photos/[photoId] error:", error);
    return NextResponse.json({ error: "فشل تحديث الصورة" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requirePermission("settings.unit_types:edit");
    const { id: idStr, photoId: photoIdStr } = await params;
    const id = Number(idStr);
    const photoId = Number(photoIdStr);
    if (!Number.isFinite(id) || !Number.isFinite(photoId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const photo = await prisma.unitTypePhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.unitTypeId !== id) {
      return NextResponse.json({ error: "الصورة غير موجودة" }, { status: 404 });
    }

    await prisma.unitTypePhoto.delete({ where: { id: photoId } });

    if (photo.url.startsWith("stored:")) {
      await deleteStoredFile(photo.url.slice("stored:".length));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/unit-types/[id]/photos/[photoId] error:", error);
    return NextResponse.json({ error: "فشل حذف الصورة" }, { status: 500 });
  }
}
