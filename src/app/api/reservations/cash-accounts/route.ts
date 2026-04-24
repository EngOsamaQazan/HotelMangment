import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * Lightweight lookup that powers the "طريقة الدفع" dropdown on the
 * reservation form. Returns all active cash-family accounts (cash / bank /
 * wallet) from the chart of accounts so the options stay in sync with
 * whatever the accountant defines there — instead of being hard-coded.
 */
export async function GET() {
  try {
    await requirePermission("reservations:view");

    const accounts = await prisma.account.findMany({
      where: {
        type: "asset",
        subtype: { in: ["cash", "bank", "wallet"] },
        isActive: true,
      },
      select: { code: true, name: true, subtype: true },
      orderBy: [{ subtype: "asc" }, { code: "asc" }],
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/reservations/cash-accounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch cash accounts" },
      { status: 500 }
    );
  }
}
