import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePartyAccounts, getPartyBalance } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(request: Request) {
  try {
    await requirePermission("accounting.parties:view");
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const withBalances = searchParams.get("balances") === "1";

    const where: {
      isActive: boolean;
      type?: string;
      OR?: Array<Record<string, unknown>>;
    } = { isActive: true };

    if (type && type !== "all") where.type = type;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { nationalId: { contains: search } },
        { code: { contains: search } },
      ];
    }

    const parties = await prisma.party.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (!withBalances) {
      return NextResponse.json({ parties });
    }

    const withBal = await Promise.all(
      parties.map(async (p) => {
        const b = await getPartyBalance(p.id);
        return { ...p, balance: b.balance };
      })
    );

    return NextResponse.json({ parties: withBal });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/parties error:", error);
    return NextResponse.json({ error: "Failed to fetch parties" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("accounting.parties:create");
    const body = await request.json();
    const {
      name,
      type,
      phone,
      email,
      nationalId,
      notes,
      code,
      openingBalance,
      openingDate,
      // employee-specific
      baseSalary,
      commissionRate,
      salaryPayDay,
      hireDate,
      jobTitle,
    } = body;

    if (!name || !type) {
      return NextResponse.json(
        { error: "الاسم والنوع مطلوبان" },
        { status: 400 }
      );
    }

    const validTypes = ["guest", "partner", "supplier", "employee", "lender", "other"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "نوع الطرف غير صالح" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          name,
          type,
          phone: phone || null,
          email: email || null,
          nationalId: nationalId || null,
          notes: notes || null,
          code: code || null,
          openingBalance: openingBalance ? Number(openingBalance) : 0,
          openingDate: openingDate ? new Date(openingDate) : null,
          baseSalary:
            type === "employee" && baseSalary !== undefined && baseSalary !== null && baseSalary !== ""
              ? Number(baseSalary)
              : null,
          commissionRate:
            type === "employee" && commissionRate !== undefined && commissionRate !== null && commissionRate !== ""
              ? Number(commissionRate)
              : null,
          salaryPayDay:
            type === "employee" && salaryPayDay !== undefined && salaryPayDay !== null && salaryPayDay !== ""
              ? Number(salaryPayDay)
              : null,
          hireDate: hireDate ? new Date(hireDate) : null,
          jobTitle: jobTitle || null,
        },
      });

      await ensurePartyAccounts(tx, party.id);
      return tx.party.findUnique({ where: { id: party.id } });
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/accounting/parties error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create party";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
