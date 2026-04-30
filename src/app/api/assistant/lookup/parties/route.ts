import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/assistant/lookup/parties?q=...&type=...
 *
 * Read-only lookup of active parties for the assistant draft editor.
 * Gated by `assistant:use` so operators can fix the wrong party on a
 * pending journal entry without `accounting.parties:view`.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("assistant:use");
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const type = (searchParams.get("type") ?? "").trim();
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 30) || 30, 100));

    const where: Record<string, unknown> = { isActive: true };
    if (type && ["guest", "partner", "supplier", "employee", "lender", "other"].includes(type)) {
      where.type = type;
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ];
    }

    const parties = await prisma.party.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
      select: { id: true, name: true, type: true, phone: true },
    });
    return NextResponse.json({ parties });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/lookup/parties", e);
    return NextResponse.json({ error: "فشل تحميل الأطراف" }, { status: 500 });
  }
}
