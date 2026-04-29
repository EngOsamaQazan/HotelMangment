import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PARTY_BALANCE_ACCOUNT_TYPES } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.parties:view");
    const { id } = await params;
    const partyId = parseInt(id);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party) {
      return NextResponse.json({ error: "الطرف غير موجود" }, { status: 404 });
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    // Party balance lives on balance-sheet accounts only — see the comment on
    // `PARTY_BALANCE_ACCOUNT_TYPES` in `src/lib/accounting.ts` for why expense
    // and revenue lines that happen to carry a `partyId` (per-employee salary
    // expense, per-partner commission, …) must not contribute to the running
    // balance shown on the party statement.
    const accountFilter: Prisma.JournalLineWhereInput = {
      account: { type: { in: [...PARTY_BALANCE_ACCOUNT_TYPES] } },
    };

    let openingBalance = 0;
    if (from) {
      const openAgg = await prisma.journalLine.aggregate({
        where: {
          partyId,
          ...accountFilter,
          entry: { status: "posted", date: { lt: new Date(from) } },
        },
        _sum: { debit: true, credit: true },
      });
      openingBalance =
        Number(openAgg._sum?.debit || 0) - Number(openAgg._sum?.credit || 0);
    }

    const lines = await prisma.journalLine.findMany({
      where: {
        partyId,
        ...accountFilter,
        entry: {
          status: "posted",
          ...(from || to ? { date: dateFilter } : {}),
        },
      },
      include: {
        entry: true,
        account: true,
      },
      orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
    });

    let running = openingBalance;
    const rows = lines.map((l) => {
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      running += debit - credit;
      return {
        id: l.id,
        date: l.entry.date,
        entryNumber: l.entry.entryNumber,
        entryId: l.entry.id,
        description: l.entry.description,
        lineDescription: l.description,
        accountCode: l.account.code,
        accountName: l.account.name,
        debit,
        credit,
        balance: Math.round(running * 100) / 100,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        debit: acc.debit + r.debit,
        credit: acc.credit + r.credit,
      }),
      { debit: 0, credit: 0 }
    );

    // Display rows newest-first. Running balances were computed chronologically
    // (ascending) so each row's balance is correct; we only flip the order.
    rows.reverse();

    return NextResponse.json({
      party,
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(running * 100) / 100,
      totalDebit: Math.round(totals.debit * 100) / 100,
      totalCredit: Math.round(totals.credit * 100) / 100,
      rows,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/parties/[id]/statement error:", error);
    return NextResponse.json({ error: "Failed to fetch statement" }, { status: 500 });
  }
}
