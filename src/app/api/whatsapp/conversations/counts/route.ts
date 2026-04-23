import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/whatsapp/conversations/counts?status=open
 *
 * Cheap counters for the inbox tabs. Returns:
 *   { all, mine, unassigned }
 *
 * Status defaults to "open" (most common view); pass `status=any` to get the
 * full totals regardless of resolution state.
 */
export async function GET(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "open";
    const userId = Number((session.user as { id?: string | number }).id);

    const baseWhere: Record<string, unknown> = {};
    if (status && status !== "any") baseWhere.status = status;

    const [all, mine, unassigned] = await Promise.all([
      prisma.whatsAppConversation.count({ where: baseWhere }),
      prisma.whatsAppConversation.count({
        where: { ...baseWhere, assignedToUserId: userId },
      }),
      prisma.whatsAppConversation.count({
        where: { ...baseWhere, assignedToUserId: null },
      }),
    ]);

    return NextResponse.json({ all, mine, unassigned });
  } catch (err) {
    console.error("[GET /api/whatsapp/conversations/counts]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر حساب العدّادات" },
      { status: 500 },
    );
  }
}
