import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";
import { deleteMerge, MergeError } from "@/lib/units/merge";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("rooms:edit");
    const { id } = await params;
    const mergeId = Number(id);
    if (!Number.isFinite(mergeId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }
    await deleteMerge(prisma, mergeId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof MergeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("DELETE /api/unit-merges/[id] error:", error);
    return NextResponse.json({ error: "فشل فكّ الارتباط" }, { status: 500 });
  }
}
