import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { UPLOADS_DIR } from "@/lib/uploads";

/**
 * Public, no-auth file server for static content images (room gallery,
 * brand photos, etc.) stored under `<UPLOADS_DIR>/content/`.
 *
 *   GET /api/files/content/rooms/01.jpg
 *   GET /api/files/content/brand/brand-1.jpeg
 *
 * Path traversal is blocked by resolving and checking against the
 * content root. Responses include long cache headers suitable for CDN.
 */

const CONTENT_ROOT = path.join(UPLOADS_DIR, "content");

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
  }

  const rel = segments.join("/");
  const abs = path.resolve(CONTENT_ROOT, rel);
  const root = path.resolve(CONTENT_ROOT);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    return NextResponse.json({ error: "مسار غير صالح" }, { status: 400 });
  }

  try {
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs).slice(1).toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
  }
}
