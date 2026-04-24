import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { fetchMediaStream, isWhatsAppApiError } from "@/lib/whatsapp/client";

export const runtime = "nodejs";
// Media can be large (videos up to 16MB); don't try to cache or edge-run.
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/media/[id]?message=<messageId>
 *
 * Streams a WhatsApp media file from Meta through our server. We *must*
 * proxy because Meta's short-lived download URLs require our bearer token —
 * the browser can never talk to them directly.
 *
 * We enrich the stored `WhatsAppMessage` row with the resolved mime/sha256/
 * size on first download, then serve bytes straight through via
 * `Response(body, { headers })` so we don't buffer large files in RAM.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const { id: mediaId } = await ctx.params;
    if (!mediaId || mediaId.length > 128) {
      return NextResponse.json({ error: "رقم الملف غير صالح" }, { status: 400 });
    }

    const { response, info } = await fetchMediaStream(mediaId);

    // Best-effort: enrich the DB row so future opens are faster.
    const url = new URL(req.url);
    const messageIdRaw = url.searchParams.get("message");
    if (messageIdRaw) {
      const messageId = Number(messageIdRaw);
      if (Number.isFinite(messageId)) {
        prisma.whatsAppMessage
          .update({
            where: { id: messageId },
            data: {
              mediaMimeType: info.mime_type ?? undefined,
              mediaSha256: info.sha256 ?? undefined,
              mediaSize:
                typeof info.file_size === "number" ? info.file_size : undefined,
            },
          })
          .catch(() => {
            // Non-fatal — a stale row shouldn't break the user's download.
          });
      }
    }

    const headers = new Headers();
    headers.set("Content-Type", info.mime_type ?? "application/octet-stream");
    const len = response.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    // Cache on the user's browser for an hour — Meta's URL has already
    // expired so they'd have to come through us anyway to refetch. We
    // deliberately do not add s-maxage so CDNs don't replay across users.
    headers.set("Cache-Control", "private, max-age=3600");
    // Let the UI download documents with a sensible filename.
    const disposition = url.searchParams.get("download");
    if (disposition) {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(disposition)}"`,
      );
    }

    return new Response(response.body, { status: 200, headers });
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    if (isWhatsAppApiError(err)) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status || 502 },
      );
    }
    console.error("[GET /api/whatsapp/media/:id]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل الملف" },
      { status: 500 },
    );
  }
}
