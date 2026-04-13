import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
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
    console.error("GET /api/finance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date, description, reservationId, amount, type, account, bankRef } = body;

    if (!date || !description || amount === undefined || !type || !account) {
      return NextResponse.json(
        { error: "Missing required fields: date, description, amount, type, account" },
        { status: 400 }
      );
    }

    if (!["income", "expense"].includes(type)) {
      return NextResponse.json({ error: "Type must be 'income' or 'expense'" }, { status: 400 });
    }

    if (!["cash", "bank"].includes(account)) {
      return NextResponse.json({ error: "Account must be 'cash' or 'bank'" }, { status: 400 });
    }

    if (reservationId) {
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) {
        return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
      }
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          date: new Date(date),
          description,
          reservationId: reservationId || null,
          amount: Number(amount),
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

      if (reservationId && type === "income") {
        const totalPaid = await tx.transaction.aggregate({
          where: { reservationId, type: "income" },
          _sum: { amount: true },
        });

        const reservation = await tx.reservation.findUnique({
          where: { id: reservationId },
        });

        if (reservation) {
          const paid = Number(totalPaid._sum.amount || 0);
          const remaining = Number(reservation.totalAmount) - paid;
          await tx.reservation.update({
            where: { id: reservationId },
            data: {
              paidAmount: paid,
              remaining: Math.max(0, remaining),
            },
          });
        }
      }

      return txn;
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("POST /api/finance error:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
