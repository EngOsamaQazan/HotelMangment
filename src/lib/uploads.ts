import "server-only";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/**
 * File storage root. Defaults to `/opt/hotel-app/uploads` in production and
 * `<cwd>/uploads` in development. Overridable via UPLOADS_DIR env var.
 */
export const UPLOADS_DIR =
  process.env.UPLOADS_DIR ||
  (process.env.NODE_ENV === "production"
    ? "/opt/hotel-app/uploads"
    : path.join(process.cwd(), "uploads"));

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "audio/",
  "video/",
  "application/zip",
  "application/x-zip-compressed",
];

export class UploadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface SavedUpload {
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string; // relative to UPLOADS_DIR, e.g. "2026/04/abc123.png"
}

function sanitizeFileName(name: string): string {
  const base = name.replace(/[\\/]/g, "_").trim();
  return base.slice(0, 180) || "file";
}

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

/**
 * Persist a `File` (from FormData) to the uploads directory.
 * Returns metadata suitable for storing on a DB row.
 */
export async function saveFormFile(file: File): Promise<SavedUpload> {
  if (!file || typeof file === "string") {
    throw new UploadError(400, "لم يُرفق أي ملف");
  }
  if (file.size <= 0) {
    throw new UploadError(400, "الملف فارغ");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(
      413,
      `حجم الملف يتجاوز الحد المسموح به (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)`,
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!isAllowedMime(mime)) {
    throw new UploadError(415, `نوع الملف غير مسموح: ${mime}`);
  }

  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const subdir = path.join(y, m);
  const absDir = path.join(UPLOADS_DIR, subdir);
  await fs.mkdir(absDir, { recursive: true });

  const origName = sanitizeFileName(file.name || "file");
  const ext = path.extname(origName);
  const random = randomBytes(8).toString("hex");
  const storedName = `${Date.now()}-${random}${ext}`;
  const absPath = path.join(absDir, storedName);

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absPath, buf);

  return {
    fileName: origName,
    mimeType: mime,
    size: file.size,
    storagePath: path.posix.join(subdir.replace(/\\/g, "/"), storedName),
  };
}

/**
 * Resolve a relative storagePath to an absolute path, with a safety check
 * that the final path is still inside UPLOADS_DIR (prevents ../ escape).
 */
export function resolveStoragePath(rel: string): string {
  const abs = path.resolve(UPLOADS_DIR, rel);
  const root = path.resolve(UPLOADS_DIR);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new UploadError(400, "مسار الملف غير صالح");
  }
  return abs;
}

/** Delete the file from disk if it exists (best-effort). */
export async function deleteStoredFile(rel: string): Promise<void> {
  try {
    const abs = resolveStoragePath(rel);
    await fs.unlink(abs);
  } catch {
    // ignore
  }
}
