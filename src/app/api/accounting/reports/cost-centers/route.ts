import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * Cost-Centers performance report.
 *
 * Aggregates posted journal lines per cost center within an optional date
 * range, then walks the parent tree to roll children up into their parents
 * (so a parent shows total of itself + all descendants).
 *
 * Each row: { id, code, name, parentId, depth, debit, credit, net,
 *             debitOwn, creditOwn, lines, hasChildren }.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("accounting.reports:view");
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) {
      const d = new Date(to);
      // include the whole "to" day
      d.setHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }

    const centers = await prisma.costCenter.findMany({
      orderBy: { code: "asc" },
    });

    // Aggregate per-center own totals (excluding descendants).
    const totals = await prisma.journalLine.groupBy({
      by: ["costCenterId"],
      _sum: { debit: true, credit: true },
      _count: { _all: true },
      where: {
        costCenterId: { in: centers.map((c) => c.id) },
        entry: {
          status: "posted",
          ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
        },
      },
    });

    type Row = {
      id: number;
      code: string;
      name: string;
      parentId: number | null;
      depth: number;
      debitOwn: number;
      creditOwn: number;
      linesOwn: number;
      debit: number;
      credit: number;
      net: number;
      lines: number;
      hasChildren: boolean;
    };

    const ownByCenter = new Map<
      number,
      { debit: number; credit: number; lines: number }
    >();
    for (const t of totals) {
      if (t.costCenterId == null) continue;
      ownByCenter.set(t.costCenterId, {
        debit: Number(t._sum.debit || 0),
        credit: Number(t._sum.credit || 0),
        lines: t._count._all,
      });
    }

    // Build adjacency for roll-up.
    const childrenByParent = new Map<number | null, number[]>();
    for (const c of centers) {
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c.id);
      childrenByParent.set(c.parentId, list);
    }

    const byId = new Map(centers.map((c) => [c.id, c]));

    function rollupId(id: number): {
      debit: number;
      credit: number;
      lines: number;
    } {
      const own = ownByCenter.get(id) ?? { debit: 0, credit: 0, lines: 0 };
      let debit = own.debit;
      let credit = own.credit;
      let lines = own.lines;
      for (const childId of childrenByParent.get(id) ?? []) {
        const r = rollupId(childId);
        debit += r.debit;
        credit += r.credit;
        lines += r.lines;
      }
      return { debit, credit, lines };
    }

    function depthOf(id: number): number {
      let d = 0;
      let cur = byId.get(id);
      while (cur?.parentId != null) {
        d += 1;
        cur = byId.get(cur.parentId);
      }
      return d;
    }

    const rows: Row[] = centers.map((c) => {
      const own = ownByCenter.get(c.id) ?? { debit: 0, credit: 0, lines: 0 };
      const total = rollupId(c.id);
      return {
        id: c.id,
        code: c.code,
        name: c.name,
        parentId: c.parentId,
        depth: depthOf(c.id),
        debitOwn: round2(own.debit),
        creditOwn: round2(own.credit),
        linesOwn: own.lines,
        debit: round2(total.debit),
        credit: round2(total.credit),
        net: round2(total.debit - total.credit),
        lines: total.lines,
        hasChildren: (childrenByParent.get(c.id)?.length ?? 0) > 0,
      };
    });

    // Sort: by parent path so parents appear before children.
    rows.sort((a, b) => a.code.localeCompare(b.code));

    const grand = {
      debit: round2(rows.filter((r) => r.depth === 0).reduce((s, r) => s + r.debit, 0)),
      credit: round2(rows.filter((r) => r.depth === 0).reduce((s, r) => s + r.credit, 0)),
    };

    return NextResponse.json({
      from: from || null,
      to: to || null,
      rows,
      totals: {
        debit: grand.debit,
        credit: grand.credit,
        net: round2(grand.debit - grand.credit),
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/reports/cost-centers error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
