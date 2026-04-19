import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccountBalance } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("accounting.accounts:view");
    const { searchParams } = new URL(request.url);
    const withBalances = searchParams.get("balances") === "1";
    const type = searchParams.get("type");
    const asOf = searchParams.get("asOf");

    const where: { isActive: boolean; type?: string } = { isActive: true };
    if (type) where.type = type;

    const accounts = await prisma.account.findMany({
      where,
      orderBy: { code: "asc" },
    });

    if (!withBalances) {
      return NextResponse.json({ accounts });
    }

    const asOfDate = asOf ? new Date(asOf) : undefined;
    const withBal = await Promise.all(
      accounts.map(async (a) => {
        const b = await getAccountBalance(a.id, asOfDate);
        return { ...a, balance: b.balance, debitTotal: b.debit, creditTotal: b.credit };
      })
    );
    return NextResponse.json({ accounts: withBal });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("accounting.accounts:create");
    const body = await request.json();
    const { code, name, type, subtype, normalBalance, parentId, description } = body;

    if (!code || !name || !type || !normalBalance) {
      return NextResponse.json(
        { error: "الحقول المطلوبة: code, name, type, normalBalance" },
        { status: 400 }
      );
    }

    if (!["asset", "liability", "equity", "revenue", "expense"].includes(type)) {
      return NextResponse.json({ error: "نوع الحساب غير صالح" }, { status: 400 });
    }
    if (!["debit", "credit"].includes(normalBalance)) {
      return NextResponse.json({ error: "الرصيد الطبيعي غير صالح" }, { status: 400 });
    }

    const existing = await prisma.account.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "رمز الحساب موجود مسبقاً" }, { status: 409 });
    }

    const account = await prisma.account.create({
      data: {
        code,
        name,
        type,
        subtype: subtype || null,
        normalBalance,
        parentId: parentId ? Number(parentId) : null,
        description: description || null,
        isSystem: false,
        isActive: true,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/accounting/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
