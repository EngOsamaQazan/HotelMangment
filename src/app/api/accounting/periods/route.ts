import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postEntry, ACCOUNT_CODES } from "@/lib/accounting";

export async function GET() {
  try {
    const periods = await prisma.fiscalPeriod.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    return NextResponse.json({ periods });
  } catch (error) {
    console.error("GET /api/accounting/periods error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, month, action } = body;

    if (!year || !month || !action) {
      return NextResponse.json(
        { error: "year, month, action مطلوبة" },
        { status: 400 }
      );
    }

    if (!["open", "close", "closeYear"].includes(action)) {
      return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }

    if (action === "open") {
      const p = await prisma.fiscalPeriod.upsert({
        where: { year_month: { year: Number(year), month: Number(month) } },
        update: { status: "open", closedAt: null, closedBy: null },
        create: { year: Number(year), month: Number(month), status: "open" },
      });
      return NextResponse.json(p);
    }

    if (action === "close") {
      const p = await prisma.fiscalPeriod.upsert({
        where: { year_month: { year: Number(year), month: Number(month) } },
        update: { status: "closed", closedAt: new Date() },
        create: {
          year: Number(year),
          month: Number(month),
          status: "closed",
          closedAt: new Date(),
        },
      });
      return NextResponse.json(p);
    }

    if (action === "closeYear") {
      const y = Number(year);
      const endOfYear = new Date(y, 11, 31, 23, 59, 59);

      const result = await prisma.$transaction(async (tx) => {
        const revenues = await tx.account.findMany({
          where: { type: "revenue", isActive: true },
        });
        const expenses = await tx.account.findMany({
          where: { type: "expense", isActive: true },
        });

        const lines: {
          accountCode: string;
          debit?: number;
          credit?: number;
          description?: string;
        }[] = [];
        let totalRevenue = 0;
        let totalExpense = 0;

        for (const r of revenues) {
          const agg = await tx.journalLine.aggregate({
            where: {
              accountId: r.id,
              entry: {
                status: "posted",
                date: { gte: new Date(y, 0, 1), lte: endOfYear },
              },
            },
            _sum: { debit: true, credit: true },
          });
          const bal =
            Number(agg._sum.credit || 0) - Number(agg._sum.debit || 0);
          if (Math.abs(bal) > 0.005) {
            lines.push({
              accountCode: r.code,
              debit: bal,
              description: `إقفال حساب ${r.name}`,
            });
            totalRevenue += bal;
          }
        }

        for (const e of expenses) {
          const agg = await tx.journalLine.aggregate({
            where: {
              accountId: e.id,
              entry: {
                status: "posted",
                date: { gte: new Date(y, 0, 1), lte: endOfYear },
              },
            },
            _sum: { debit: true, credit: true },
          });
          const bal =
            Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
          if (Math.abs(bal) > 0.005) {
            lines.push({
              accountCode: e.code,
              credit: bal,
              description: `إقفال حساب ${e.name}`,
            });
            totalExpense += bal;
          }
        }

        const netProfit = totalRevenue - totalExpense;

        if (lines.length === 0 || Math.abs(netProfit) < 0.005) {
          return { entryNumber: null, message: "لا توجد أرصدة إيرادات/مصروفات للإقفال" };
        }

        if (netProfit >= 0) {
          lines.push({
            accountCode: ACCOUNT_CODES.RETAINED_EARNINGS,
            credit: netProfit,
            description: `ترحيل صافي ربح عام ${y}`,
          });
        } else {
          lines.push({
            accountCode: ACCOUNT_CODES.RETAINED_EARNINGS,
            debit: -netProfit,
            description: `ترحيل صافي خسارة عام ${y}`,
          });
        }

        const entry = await postEntry(tx, {
          date: endOfYear,
          description: `قيد إقفال سنوي لعام ${y}`,
          source: "year_close",
          lines,
        });

        for (let m = 1; m <= 12; m++) {
          await tx.fiscalPeriod.upsert({
            where: { year_month: { year: y, month: m } },
            update: { status: "closed", closedAt: new Date() },
            create: { year: y, month: m, status: "closed", closedAt: new Date() },
          });
        }

        return { entryNumber: entry.entryNumber, netProfit };
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "إجراء غير مدعوم" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/accounting/periods error:", error);
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
