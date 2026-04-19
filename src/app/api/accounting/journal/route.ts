import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postEntry } from "@/lib/accounting";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const source = searchParams.get("source");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const where: {
      date?: { gte?: Date; lte?: Date };
      source?: string;
      status?: string;
      OR?: Array<Record<string, unknown>>;
    } = {};

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    if (source && source !== "all") where.source = source;
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { entryNumber: { contains: search } },
        { description: { contains: search, mode: "insensitive" } },
        { reference: { contains: search } },
      ];
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: { account: true, party: true },
            orderBy: { lineOrder: "asc" },
          },
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return NextResponse.json({ entries, total, page, limit });
  } catch (error) {
    console.error("GET /api/accounting/journal error:", error);
    return NextResponse.json({ error: "Failed to fetch journal" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date, description, reference, lines } = body;

    if (!date || !description || !Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json(
        { error: "التاريخ والوصف ومصفوفة الأسطر (سطران على الأقل) مطلوبون" },
        { status: 400 }
      );
    }

    const entry = await prisma.$transaction(async (tx) => {
      const result = await postEntry(tx, {
        date: new Date(date),
        description,
        reference: reference || null,
        source: "manual",
        lines: lines.map((l: {
          accountId?: number;
          accountCode?: string;
          partyId?: number | null;
          debit?: number | string;
          credit?: number | string;
          description?: string | null;
        }) => ({
          accountId: l.accountId ? Number(l.accountId) : undefined,
          accountCode: l.accountCode,
          partyId: l.partyId ? Number(l.partyId) : null,
          debit: l.debit ? Number(l.debit) : 0,
          credit: l.credit ? Number(l.credit) : 0,
          description: l.description ?? null,
        })),
      });
      return tx.journalEntry.findUnique({
        where: { id: result.id },
        include: {
          lines: { include: { account: true, party: true }, orderBy: { lineOrder: "asc" } },
        },
      });
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounting/journal error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create entry";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
