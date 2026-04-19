import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  postEntry,
  getOrCreateGuestParty,
  ensurePartyAccounts,
  ACCOUNT_CODES,
} from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("finance:view");
    const { searchParams } = new URL(request.url);
    const account = searchParams.get("account");
    const type = searchParams.get("type");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (account && account !== "all") {
      where.account = account;
    }

    if (type && type !== "all") {
      where.type = type;
    }

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          reservation: {
            select: { id: true, guestName: true, unit: { select: { unitNumber: true } } },
          },
        },
        orderBy: { date: "desc" },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    const aggregates = await prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
    });

    const totalIncome = Number(aggregates.find((a) => a.type === "income")?._sum.amount || 0);
    const totalExpenses = Number(aggregates.find((a) => a.type === "expense")?._sum.amount || 0);

    return NextResponse.json({
      transactions,
      total,
      page,
      limit,
      summary: {
        totalIncome,
        totalExpenses,
        netBalance: totalIncome - totalExpenses,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/finance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("finance:create");
    const body = await request.json();
    const {
      date,
      description,
      reservationId,
      amount,
      type,
      account,
      bankRef,
      partyId,
      counterAccountCode,
    } = body;

    if (!date || !description || amount === undefined || !type || !account) {
      return NextResponse.json(
        { error: "Missing required fields: date, description, amount, type, account" },
        { status: 400 }
      );
    }

    if (!["income", "expense"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'income' or 'expense'" }, { status: 400 });
    }

    if (!["cash", "bank", "wallet"].includes(account)) {
      return NextResponse.json(
        { error: "Account must be 'cash', 'bank', or 'wallet'" },
        { status: 400 }
      );
    }

    if (reservationId) {
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }
    }

    const amountNum = Number(amount);
    const cashCode =
      account === "bank"
        ? ACCOUNT_CODES.BANK
        : account === "wallet"
          ? "1030"
          : ACCOUNT_CODES.CASH;

    const transaction = await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          date: new Date(date),
          description,
          reservationId: reservationId || null,
          amount: amountNum,
          type,
          account,
          bankRef: bankRef || null,
        },
        include: {
          reservation: {
            select: { id: true, guestName: true, unit: { select: { unitNumber: true } } },
          },
        },
      });

      let guestPartyId: number | null = null;
      let reservation: {
        id: number;
        guestName: string;
        phone: string | null;
        guestIdNumber: string | null;
        totalAmount: number;
      } | null = null;

      if (reservationId) {
        const r = await tx.reservation.findUnique({
          where: { id: reservationId },
        });
        if (r) {
          reservation = {
            id: r.id,
            guestName: r.guestName,
            phone: r.phone,
            guestIdNumber: r.guestIdNumber,
            totalAmount: Number(r.totalAmount),
          };
          guestPartyId = await getOrCreateGuestParty(tx, {
            name: r.guestName,
            phone: r.phone,
            nationalId: r.guestIdNumber,
            reservationId: r.id,
          });
        }
      }

      let counterPartyId: number | null = null;
      if (partyId) {
        const p = await tx.party.findUnique({ where: { id: Number(partyId) } });
        if (p) {
          counterPartyId = p.id;
          await ensurePartyAccounts(tx, p.id);
        }
      }

      let counterCode: string;
      let counterParty: number | null = null;

      if (type === "income") {
        if (guestPartyId) {
          counterCode = ACCOUNT_CODES.AR_GUESTS;
          counterParty = guestPartyId;
        } else if (counterAccountCode) {
          counterCode = counterAccountCode;
          counterParty = counterPartyId;
        } else {
          counterCode = ACCOUNT_CODES.REVENUE_OTHER;
        }
      } else {
        if (counterPartyId) {
          const p = await tx.party.findUnique({
            where: { id: counterPartyId },
            include: { apAccount: true, drawAccount: true },
          });
          if (p?.type === "partner" && counterAccountCode === ACCOUNT_CODES.OWNER_DRAWINGS) {
            counterCode = p.drawAccount?.code ?? ACCOUNT_CODES.OWNER_DRAWINGS;
          } else if (p?.apAccount) {
            counterCode = p.apAccount.code;
          } else {
            counterCode = counterAccountCode || ACCOUNT_CODES.EXPENSE_MISC;
          }
          counterParty = counterPartyId;
        } else if (counterAccountCode) {
          counterCode = counterAccountCode;
        } else {
          counterCode = ACCOUNT_CODES.EXPENSE_MISC;
        }
      }

      if (type === "income") {
        await postEntry(tx, {
          date: new Date(date),
          description,
          reference: bankRef || null,
          source: "payment",
          sourceRefId: txn.id,
          lines: [
            { accountCode: cashCode, debit: amountNum },
            { accountCode: counterCode, partyId: counterParty, credit: amountNum },
          ],
        });
      } else {
        await postEntry(tx, {
          date: new Date(date),
          description,
          reference: bankRef || null,
          source: "expense",
          sourceRefId: txn.id,
          lines: [
            { accountCode: counterCode, partyId: counterParty, debit: amountNum },
            { accountCode: cashCode, credit: amountNum },
          ],
        });
      }

      if (reservationId && type === "income" && reservation) {
        const totalPaid = await tx.transaction.aggregate({
          where: { reservationId, type: "income" },
          _sum: { amount: true },
        });
        const paid = Number(totalPaid._sum.amount || 0);
        const remaining = reservation.totalAmount - paid;
        await tx.reservation.update({
          where: { id: reservationId },
          data: {
            paidAmount: paid,
            remaining: Math.max(0, remaining),
          },
        });
      }

      return txn;
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/finance error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create transaction";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
