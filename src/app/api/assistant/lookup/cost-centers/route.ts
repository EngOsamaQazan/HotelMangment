import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/assistant/lookup/cost-centers?q=...
 *
 * Read-only lookup of active cost centers for the assistant draft editor.
 * Gated by `assistant:use` only.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("assistant:use");
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 30) || 30, 100));

    const where: Record<string, unknown> = { isActive: true };
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    const costCenters = await prisma.costCenter.findMany({
      where,
      orderBy: { code: "asc" },
      take: limit,
      select: { id: true, code: true, name: true },
    });
    return NextResponse.json({ costCenters });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/lookup/cost-centers", e);
    return NextResponse.json({ error: "فشل تحميل مراكز التكلفة" }, { status: 500 });
  }
}
