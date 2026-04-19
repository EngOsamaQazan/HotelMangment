import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { voidEntry } from "@/lib/accounting";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entryId = parseInt(id);
    if (isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        lines: {
          include: { account: true, party: true },
          orderBy: { lineOrder: "asc" },
        },
        reversalOf: true,
        reversedBy: true,
      },
    });
    if (!entry) {
      return NextResponse.json({ error: "القيد غير موجود" }, { status: 404 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error("GET /api/accounting/journal/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch entry" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entryId = parseInt(id);
    if (isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const { action, reason } = body;

    if (action !== "void") {
      return NextResponse.json(
        { error: "الإجراء الوحيد المدعوم حالياً: void" },
        { status: 400 }
      );
    }
    if (!reason) {
      return NextResponse.json({ error: "السبب مطلوب" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      return voidEntry(tx, entryId, reason);
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/accounting/journal/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
