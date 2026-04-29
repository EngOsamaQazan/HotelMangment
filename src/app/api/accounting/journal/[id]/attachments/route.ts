import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { saveFormFile, UploadError } from "@/lib/uploads";

/**
 * GET /api/accounting/journal/:id/attachments
 *   List supporting documents (invoices, receipts, …) attached to a JE.
 *
 * POST /api/accounting/journal/:id/attachments  (multipart/form-data)
 *   Upload one or more files. Field name "files" (repeatable) plus optional
 *   "captions" (string per file, JSON-encoded array). Returns the saved
 *   attachment metadata.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.journal:view");
    const { id } = await params;
    const entryId = parseInt(id, 10);
    if (isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }
    const exists = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "القيد غير موجود" }, { status: 404 });
    }
    const items = await prisma.journalAttachment.findMany({
      where: { entryId },
      orderBy: { id: "asc" },
    });
    return NextResponse.json({ attachments: items });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET journal attachments error:", error);
    return NextResponse.json(
      { error: "فشل تحميل المرفقات" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission(
      "accounting.journal:upload_attachment"
    );
    const userId = Number((session.user as { id?: string | number }).id) || null;

    const { id } = await params;
    const entryId = parseInt(id, 10);
    if (isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { id: true, voidedAt: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "القيد غير موجود" }, { status: 404 });
    }

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "لم يُرفق أي ملف" }, { status: 400 });
    }
    if (files.length > 10) {
      return NextResponse.json(
        { error: "يسمح برفع 10 ملفات كحد أقصى دفعة واحدة" },
        { status: 400 }
      );
    }

    let captions: string[] = [];
    const captionsRaw = form.get("captions");
    if (typeof captionsRaw === "string" && captionsRaw.trim()) {
      try {
        const parsed = JSON.parse(captionsRaw);
        if (Array.isArray(parsed)) captions = parsed.map((x) => String(x));
      } catch {
        // ignore — captions optional
      }
    }

    const created = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const saved = await saveFormFile(file);
      const row = await prisma.journalAttachment.create({
        data: {
          entryId,
          fileName: saved.fileName,
          mimeType: saved.mimeType,
          size: saved.size,
          storagePath: saved.storagePath,
          caption: captions[i]?.trim() ? captions[i].trim().slice(0, 200) : null,
          uploadedById: userId,
        },
      });
      created.push(row);
    }

    return NextResponse.json({ success: true, attachments: created });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof UploadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("POST journal attachment error:", error);
    return NextResponse.json(
      { error: "فشل رفع المرفق" },
      { status: 500 }
    );
  }
}
