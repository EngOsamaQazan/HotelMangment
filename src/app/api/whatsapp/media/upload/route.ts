import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { uploadPhoneMedia, isWhatsAppApiError } from "@/lib/whatsapp/client";

/**
 * POST /api/whatsapp/media/upload
 *
 * Uploads a file to the active phone-number's media bucket and returns
 * the `media_id` that callers can reference when sending messages or
 * template parameters with `image` / `video` / `document` parameters.
 *
 * Distinct from `/api/whatsapp/media/sample`:
 *   • /sample   → for *template definition* (returns a `handle`)
 *   • /upload   → for *send-time* media     (returns a `media_id`)
 *
 * Media IDs expire 30 days after upload. The browser uses the returned
 * `id` immediately when posting to `/api/whatsapp/templates/send`, so
 * staleness isn't an issue in normal flows.
 */
export async function POST(request: Request) {
  try {
    // Anyone allowed to send a template should be able to upload its
    // payload. We deliberately reuse `send_template` rather than create
    // a separate `upload_media` permission to keep the surface small.
    await requirePermission("whatsapp:send_template");
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
    (blob instanceof File && blob.name) || `upload.${mimeType.split("/")[1] ?? "bin"}`;
  const buffer = Buffer.from(await blob.arrayBuffer());

  try {
    const { id } = await uploadPhoneMedia({
      fileBuffer: buffer,
      mimeType,
      fileName,
    });
    return NextResponse.json({
      ok: true,
      mediaId: id,
      fileName,
      mimeType,
      sizeBytes: buffer.byteLength,
    });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      {
        error:
          apiErr?.message ?? (err as Error).message ?? "فشل رفع الملف إلى Meta",
        meta: apiErr
          ? { status: apiErr.status, code: apiErr.code, fbtraceId: apiErr.fbtraceId }
          : null,
      },
      { status: apiErr?.status ?? 502 },
    );
  }
}
