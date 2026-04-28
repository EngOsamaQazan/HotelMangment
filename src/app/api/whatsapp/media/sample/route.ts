import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { uploadResumableMedia, isWhatsAppApiError } from "@/lib/whatsapp/client";

/**
 * POST /api/whatsapp/media/sample
 *
 * Uploads a sample file via Meta's *Resumable Upload API* and returns the
 * opaque `handle` that the template-creation endpoint requires when a
 * template's HEADER format is IMAGE / VIDEO / DOCUMENT.
 *
 * Accepts `multipart/form-data` with a single `file` field. The handle
 * is one-shot (consumed when a template referencing it is approved or
 * after 30 days, whichever comes first), so we return it directly to
 * the caller without persisting.
 *
 * Permissions: only "create_template" can hit this endpoint — sample
 * uploads are useless without subsequently submitting a template.
 */
export async function POST(request: Request) {
  try {
    await requirePermission("whatsapp:create_template");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "صيغة الطلب غير صالحة (المتوقّع multipart/form-data)" },
      { status: 400 },
    );
  }

  const blob = form.get("file");
  if (!(blob instanceof Blob)) {
    return NextResponse.json(
      { error: "حقل الملف 'file' مفقود" },
      { status: 400 },
    );
  }

  const mimeType = (blob.type || "application/octet-stream").trim();
  const fileName =
    (blob instanceof File && blob.name) || `sample.${mimeType.split("/")[1] ?? "bin"}`;
  const buffer = Buffer.from(await blob.arrayBuffer());

  // Meta limits: 5MB images, 16MB video, 100MB documents. We surface a
  // friendly hint instead of letting Meta reject the upload.
  const MAX_SIZE: Record<string, number> = {
    image: 5 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    document: 100 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
  };
  const major = mimeType.split("/")[0] ?? "document";
  const limit = MAX_SIZE[major] ?? 100 * 1024 * 1024;
  if (buffer.byteLength > limit) {
    return NextResponse.json(
      {
        error: `حجم الملف (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB) يتجاوز حدّ Meta (${(limit / 1024 / 1024).toFixed(0)}MB لـ ${major}).`,
      },
      { status: 413 },
    );
  }

  try {
    const { handle } = await uploadResumableMedia({
      fileBuffer: buffer,
      mimeType,
      fileName,
    });
    return NextResponse.json({
      ok: true,
      handle,
      fileName,
      mimeType,
      sizeBytes: buffer.byteLength,
    });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error:
          apiErr?.message ?? (err as Error).message ?? "فشل رفع العيّنة إلى Meta",
        meta: apiErr
          ? { status: apiErr.status, code: apiErr.code, fbtraceId: apiErr.fbtraceId }
          : null,
      },
      { status: apiErr?.status ?? 502 },
    );
  }
}
