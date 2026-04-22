import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";
import { getMergeCandidates, getMergeForUnit } from "@/lib/units/merge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("rooms:view");
    const { id } = await params;
    const unitId = Number(id);
    if (!Number.isFinite(unitId)) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }

    const [candidates, currentMerge] = await Promise.all([
      getMergeCandidates(prisma, unitId),
      getMergeForUnit(prisma, unitId),
    ]);

    return NextResponse.json({ candidates, currentMerge });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/units/[id]/merge-candidates error:", error);
    return NextResponse.json(
      { error: "فشل تحميل الوحدات المرشّحة للدمج" },
      { status: 500 },
    );
  }
}
