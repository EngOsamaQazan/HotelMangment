import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleAuthError, requirePermission } from "@/lib/permissions/guard";
import {
  createMerge,
  listMerges,
  MergeError,
} from "@/lib/units/merge";

export async function GET() {
  try {
    await requirePermission("rooms:view");
    const rows = await listMerges(prisma);
    return NextResponse.json(rows);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/unit-merges error:", error);
    return NextResponse.json(
      { error: "فشل تحميل قائمة الدمج" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("rooms:edit");
    const body = (await request.json()) as {
      unitId?: unknown;
      otherUnitId?: unknown;
      notes?: unknown;
    };
    const unitId = Number(body.unitId);
    const otherUnitId = Number(body.otherUnitId);
    const notes =
      typeof body.notes === "string" && body.notes.trim().length > 0
        ? body.notes.trim()
        : null;

    const created = await createMerge(prisma, { unitId, otherUnitId, notes });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof MergeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/unit-merges error:", error);
    return NextResponse.json(
      { error: "فشل إنشاء الارتباط" },
      { status: 500 },
    );
  }
}
