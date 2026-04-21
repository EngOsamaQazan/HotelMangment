import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  saveFormFile,
  deleteStoredFile,
  UploadError,
} from "@/lib/uploads";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  try {
    const session = await requirePermission("profile:edit");
    const userId = Number(
      (session.user as { id?: string | number }).id,
    );

    const formData = await request.formData();
    const raw = formData.get("file");
    if (!(raw instanceof File)) {
      return NextResponse.json(
        { error: "لم يُرفق أي ملف" },
        { status: 400 },
      );
    }

    if (!raw.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "يجب أن تكون الصورة من نوع صورة (image/*)" },
        { status: 415 },
      );
    }

    if (raw.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        {
          error: `حجم الصورة يتجاوز الحد المسموح به (${Math.round(MAX_AVATAR_BYTES / 1024 / 1024)}MB)`,
        },
        { status: 413 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    const saved = await saveFormFile(raw);

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: saved.storagePath },
      select: { id: true, avatarUrl: true },
    });

    if (existing?.avatarUrl) {
      await deleteStoredFile(existing.avatarUrl);
    }

    return NextResponse.json({
      avatarUrl: updated.avatarUrl,
      url: `/api/files/avatar/${userId}`,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    console.error("POST /api/me/avatar error:", error);
    return NextResponse.json(
      { error: "Failed to upload avatar" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const session = await requirePermission("profile:edit");
    const userId = Number(
      (session.user as { id?: string | number }).id,
    );

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (existing?.avatarUrl) {
      await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: null },
      });
      await deleteStoredFile(existing.avatarUrl);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/me/avatar error:", error);
    return NextResponse.json(
      { error: "Failed to remove avatar" },
      { status: 500 },
    );
  }
}
