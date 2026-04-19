import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("accounting.ledger:view");
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!accountId) {
      return NextResponse.json({ error: "accountId مطلوب" }, { status: 400 });
    }

    const accId = parseInt(accountId);
    const account = await prisma.account.findUnique({ where: { id: accId } });
    if (!account) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    }

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    let openingBalance = 0;
    if (from) {
      const openAgg = await prisma.journalLine.aggregate({
        where: {
          accountId: accId,
          entry: { status: "posted", date: { lt: new Date(from) } },
        },
        _sum: { debit: true, credit: true },
      });
      const d = Number(openAgg._sum.debit || 0);
      const c = Number(openAgg._sum.credit || 0);
      openingBalance =
        account.normalBalance === "debit" ? d - c : c - d;
    }

    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: accId,
        entry: {
          status: "posted",
          ...(from || to ? { date: dateFilter } : {}),
        },
      },
      include: {
        entry: {
          include: {
            lines: { include: { account: true, party: true } },
          },
        },
        party: true,
      },
      orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
    });

    let running = openingBalance;
    const rows = lines.map((l) => {
      const debit = Number(l.debit);
      const credit = Number(l.credit);
      running +=
        account.normalBalance === "debit" ? debit - credit : credit - debit;

      const others = l.entry.lines.filter((x) => x.id !== l.id);
      const counterparts = others.map((o) => ({
        accountCode: o.account.code,
        accountName: o.account.name,
        partyName: o.party?.name ?? null,
        debit: Number(o.debit),
        credit: Number(o.credit),
      }));
      const counterSummary =
        counterparts.length === 0
          ? null
          : counterparts.length === 1
            ? `${counterparts[0].accountCode} ${counterparts[0].accountName}${
                counterparts[0].partyName ? ` (${counterparts[0].partyName})` : ""
              }`
            : `عدة حسابات (${counterparts.length})`;

      return {
        id: l.id,
        date: l.entry.date,
        entryId: l.entry.id,
        entryNumber: l.entry.entryNumber,
        entrySource: l.entry.source,
        entryReference: l.entry.reference,
        description: l.entry.description,
        lineDescription: l.description,
        partyId: l.partyId,
        partyName: l.party?.name ?? null,
        debit,
        credit,
        balance: Math.round(running * 100) / 100,
        counterSummary,
        counterparts,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        debit: acc.debit + r.debit,
        credit: acc.credit + r.credit,
      }),
      { debit: 0, credit: 0 }
    );

    return NextResponse.json({
      account,
      openingBalance: Math.round(openingBalance * 100) / 100,
      closingBalance: Math.round(running * 100) / 100,
      totalDebit: Math.round(totals.debit * 100) / 100,
      totalCredit: Math.round(totals.credit * 100) / 100,
      rows,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/ledger error:", error);
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  }
}
