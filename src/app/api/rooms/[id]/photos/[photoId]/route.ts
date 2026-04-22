import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";
import { deleteStoredFile } from "@/lib/uploads";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requirePermission("unit-photos:create");
    const { id: idStr, photoId: photoIdStr } = await params;
    const unitId = Number(idStr);
    const photoId = Number(photoIdStr);
    if (!Number.isFinite(unitId) || !Number.isFinite(photoId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.unitPhoto.findUnique({
      where: { id: photoId },
    });
    if (!existing || existing.unitId !== unitId) {
      return NextResponse.json(
        { error: "الصورة غير موجودة" },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      captionAr?: string | null;
      captionEn?: string | null;
      isPrimary?: boolean;
      sortOrder?: number;
    };

    const data: Record<string, unknown> = {};
    if (body.captionAr !== undefined) data.captionAr = body.captionAr || null;
    if (body.captionEn !== undefined) data.captionEn = body.captionEn || null;
    if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder))) {
      data.sortOrder = Number(body.sortOrder);
    }

    if (body.isPrimary === true) {
      await prisma.unitPhoto.updateMany({
        where: { unitId, isPrimary: true, NOT: { id: photoId } },
        data: { isPrimary: false },
      });
      data.isPrimary = true;
    } else if (body.isPrimary === false) {
      data.isPrimary = false;
    }

    const photo = await prisma.unitPhoto.update({
      where: { id: photoId },
      data,
    });
    return NextResponse.json(photo);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/rooms/[id]/photos/[photoId] error:", error);
    return NextResponse.json(
      { error: "فشل تحديث الصورة" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    await requirePermission("unit-photos:delete");
    const { id: idStr, photoId: photoIdStr } = await params;
    const unitId = Number(idStr);
    const photoId = Number(photoIdStr);
    if (!Number.isFinite(unitId) || !Number.isFinite(photoId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const existing = await prisma.unitPhoto.findUnique({
      where: { id: photoId },
    });
    if (!existing || existing.unitId !== unitId) {
      return NextResponse.json(
        { error: "الصورة غير موجودة" },
        { status: 404 },
      );
    }

    await prisma.unitPhoto.delete({ where: { id: photoId } });

    // Best-effort storage cleanup for locally stored files.
    if (existing.url.startsWith("stored:")) {
      await deleteStoredFile(existing.url.replace(/^stored:/, ""));
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/rooms/[id]/photos/[photoId] error:", error);
    return NextResponse.json(
      { error: "فشل حذف الصورة" },
      { status: 500 },
    );
  }
}
