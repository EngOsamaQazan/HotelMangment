import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { deleteStoredFile } from "@/lib/uploads";

/**
 * DELETE /api/accounting/journal/:id/attachments/:attachmentId
 * Removes a single attachment (DB row + on-disk file).
 *
 * Requires `accounting.journal:remove_attachment`. The audit trail of the JE
 * itself is unaffected — this only removes the supporting document.
 */
export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; attachmentId: string }>;
  }
) {
  try {
    await requirePermission("accounting.journal:remove_attachment");
    const { id, attachmentId } = await params;
    const entryId = parseInt(id, 10);
    const attId = parseInt(attachmentId, 10);
    if (isNaN(entryId) || isNaN(attId)) {
      return NextResponse.json(
        { error: "معرّفات غير صالحة" },
        { status: 400 }
      );
    }
    const att = await prisma.journalAttachment.findUnique({
      where: { id: attId },
    });
    if (!att || att.entryId !== entryId) {
      return NextResponse.json(
        { error: "المرفق غير موجود" },
        { status: 404 }
      );
    }
    await prisma.journalAttachment.delete({ where: { id: attId } });
    await deleteStoredFile(att.storagePath);
    return NextResponse.json({ success: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE journal attachment error:", error);
    return NextResponse.json(
      { error: "فشل حذف المرفق" },
      { status: 500 }
    );
  }
}
