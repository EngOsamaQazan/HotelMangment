import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/assistant/lookup/accounts?q=...&limit=...
 *
 * Read-only lookup of active accounts for the assistant draft editor.
 * Gated by `assistant:use` only — operators with `assistant:use` are
 * allowed to inspect the chart of accounts when correcting an LLM-
 * proposed journal entry, even if they don't hold the full
 * `accounting.accounts:view` permission.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("assistant:use");
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const type = (searchParams.get("type") ?? "").trim();
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? 30) || 30, 200));

    const where: Record<string, unknown> = { isActive: true };
    if (type && ["asset", "liability", "equity", "revenue", "expense"].includes(type)) {
      where.type = type;
    }
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ];
    }

    const accounts = await prisma.account.findMany({
      where,
      orderBy: { code: "asc" },
      take: limit,
      select: { id: true, code: true, name: true, type: true, subtype: true, parentId: true },
    });
    return NextResponse.json({ accounts });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/lookup/accounts", e);
    return NextResponse.json({ error: "فشل تحميل الحسابات" }, { status: 500 });
  }
}
