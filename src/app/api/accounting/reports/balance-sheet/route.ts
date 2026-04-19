import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("accounting.reports:view");
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf");
    const asOfDate = asOf ? new Date(asOf) : undefined;

    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        type: { in: ["asset", "liability", "equity"] },
      },
      orderBy: { code: "asc" },
    });

    const rows = await Promise.all(
      accounts.map(async (a) => {
        const agg = await prisma.journalLine.aggregate({
          where: {
            accountId: a.id,
            entry: {
              status: "posted",
              ...(asOfDate ? { date: { lte: asOfDate } } : {}),
            },
          },
          _sum: { debit: true, credit: true },
        });
        const debit = Number(agg._sum.debit || 0);
        const credit = Number(agg._sum.credit || 0);
        const balance =
          a.normalBalance === "debit" ? debit - credit : credit - debit;
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          balance: Math.round(balance * 100) / 100,
        };
      })
    );

    const assets = rows.filter((r) => r.type === "asset" && r.balance !== 0);
    const liabilities = rows.filter((r) => r.type === "liability" && r.balance !== 0);
    const equity = rows.filter((r) => r.type === "equity" && r.balance !== 0);

    const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
    const totalEquityBooked = equity.reduce((s, r) => s + r.balance, 0);

    const revenueAgg = await prisma.journalLine.aggregate({
      where: {
        account: { type: "revenue" },
        entry: {
          status: "posted",
          ...(asOfDate ? { date: { lte: asOfDate } } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    });
    const expenseAgg = await prisma.journalLine.aggregate({
      where: {
        account: { type: "expense" },
        entry: {
          status: "posted",
          ...(asOfDate ? { date: { lte: asOfDate } } : {}),
        },
      },
      _sum: { debit: true, credit: true },
    });
    const revenue =
      Number(revenueAgg._sum.credit || 0) - Number(revenueAgg._sum.debit || 0);
    const expense =
      Number(expenseAgg._sum.debit || 0) - Number(expenseAgg._sum.credit || 0);
    const currentYearProfit = Math.round((revenue - expense) * 100) / 100;

    const totalEquity = Math.round((totalEquityBooked + currentYearProfit) * 100) / 100;
    const totalLiabilitiesEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100;

    return NextResponse.json({
      asOf: asOfDate ?? null,
      assets,
      liabilities,
      equity,
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      bookedEquity: Math.round(totalEquityBooked * 100) / 100,
      currentYearProfit,
      totalEquity,
      totalLiabilitiesEquity,
      balanced: Math.abs(totalAssets - totalLiabilitiesEquity) < 0.01,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/reports/balance-sheet error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
