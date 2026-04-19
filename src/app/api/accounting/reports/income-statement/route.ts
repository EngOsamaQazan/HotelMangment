import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const accounts = await prisma.account.findMany({
      where: { isActive: true, type: { in: ["revenue", "expense"] } },
      orderBy: { code: "asc" },
    });

    const rows = await Promise.all(
      accounts.map(async (a) => {
        const agg = await prisma.journalLine.aggregate({
          where: {
            accountId: a.id,
            entry: {
              status: "posted",
              ...(from || to ? { date: dateFilter } : {}),
            },
          },
          _sum: { debit: true, credit: true },
        });
        const debit = Number(agg._sum.debit || 0);
        const credit = Number(agg._sum.credit || 0);
        const amount =
          a.type === "revenue" ? credit - debit : debit - credit;
        return {
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          amount: Math.round(amount * 100) / 100,
        };
      })
    );

    const revenues = rows.filter((r) => r.type === "revenue" && r.amount !== 0);
    const expenses = rows.filter((r) => r.type === "expense" && r.amount !== 0);

    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
    const netProfit = totalRevenue - totalExpense;

    return NextResponse.json({
      from: from ?? null,
      to: to ?? null,
      revenues,
      expenses,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
    });
  } catch (error) {
    console.error("GET /api/accounting/reports/income-statement error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
