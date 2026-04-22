import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  uploadFileHandle,
  updateBusinessProfile,
  getBusinessProfile,
  isWhatsAppApiError,
} from "@/lib/whatsapp/client";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — Meta's practical limit for profile pics
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png"]);

/**
 * POST /api/whatsapp/profile/picture
 * multipart/form-data with `file` field.
 *
 * Flow:
 *  1. Upload the image via Resumable Upload API → get a handle.
 *  2. POST to /{phone_number_id}/whatsapp_business_profile with the handle.
 */
export async function POST(req: Request) {
  try {
    try {
      await requirePermission("settings.whatsapp:edit");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json(
        { error: "يجب إرسال الصورة كـ multipart/form-data" },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "لم يتم استلام ملف" }, { status: 400 });
    }

    const mime = file.type || "image/jpeg";
    if (!ALLOWED_TYPES.has(mime.toLowerCase())) {
      return NextResponse.json(
        { error: "الصيغة غير مدعومة — استخدم JPG أو PNG" },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `حجم الصورة يتجاوز الحد (${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB)` },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());

    try {
      const handle = await uploadFileHandle({
        bytes,
        mimeType: mime,
        fileName: file.name || "logo.jpg",
      });
      await updateBusinessProfile({ profile_picture_handle: handle });
      const fresh = await getBusinessProfile();
      return NextResponse.json({ ok: true, profile: fresh });
    } catch (err) {
      const apiErr = isWhatsAppApiError(err) ? err : null;
      return NextResponse.json(
        {
          error: apiErr?.message ?? (err as Error).message ?? "تعذّر رفع الصورة",
          code: apiErr?.code,
          subcode: apiErr?.subcode,
        },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    console.error("[POST /api/whatsapp/profile/picture]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر رفع الصورة" },
      { status: 500 },
    );
  }
}
