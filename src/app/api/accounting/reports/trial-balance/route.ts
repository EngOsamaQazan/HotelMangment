import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf");
    const asOfDate = asOf ? new Date(asOf) : undefined;

    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });

    const lineFilter = {
      entry: {
        status: "posted" as const,
        ...(asOfDate ? { date: { lte: asOfDate } } : {}),
      },
    };

    const rows = await Promise.all(
      accounts.map(async (a) => {
        const agg = await prisma.journalLine.aggregate({
          where: { accountId: a.id, ...lineFilter },
          _sum: { debit: true, credit: true },
        });
        const debit = Number(agg._sum.debit || 0);
        const credit = Number(agg._sum.credit || 0);
        const net = debit - credit;
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          normalBalance: a.normalBalance,
          debit: Math.round(debit * 100) / 100,
          credit: Math.round(credit * 100) / 100,
          debitBalance: net > 0 ? Math.round(net * 100) / 100 : 0,
          creditBalance: net < 0 ? Math.round(-net * 100) / 100 : 0,
        };
      })
    );

    const active = rows.filter((r) => r.debit !== 0 || r.credit !== 0);

    const totals = active.reduce(
      (acc, r) => ({
        debit: acc.debit + r.debit,
        credit: acc.credit + r.credit,
        debitBalance: acc.debitBalance + r.debitBalance,
        creditBalance: acc.creditBalance + r.creditBalance,
      }),
      { debit: 0, credit: 0, debitBalance: 0, creditBalance: 0 }
    );

    return NextResponse.json({
      asOf: asOfDate ?? null,
      rows: active,
      totals: {
        debit: Math.round(totals.debit * 100) / 100,
        credit: Math.round(totals.credit * 100) / 100,
        debitBalance: Math.round(totals.debitBalance * 100) / 100,
        creditBalance: Math.round(totals.creditBalance * 100) / 100,
      },
    });
  } catch (error) {
    console.error("GET /api/accounting/reports/trial-balance error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
