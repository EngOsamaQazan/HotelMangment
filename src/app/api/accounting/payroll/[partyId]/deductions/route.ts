import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_CODES } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { getDeductionProgress } from "@/lib/payroll/deductions";

const VALID_CALC_TYPES = new Set(["fixed", "percent_gross", "percent_net"]);
const VALID_MODES = new Set(["continuous", "installment"]);
const VALID_CATEGORIES = new Set([
  "insurance",
  "permit",
  "court",
  "loan",
  "other",
]);

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

interface CreateBody {
  name?: string;
  category?: string;
  calcType?: string;
  amount?: number | string;
  percent?: number | string; // accepted as percent (0..100) OR ratio (0..1) — see normalizePercent
  mode?: string;
  totalAmount?: number | string;
  startYear?: number;
  startMonth?: number;
  endYear?: number | null;
  endMonth?: number | null;
  liabilityAccountCode?: string | null;
  liabilityAccountId?: number | null;
  priority?: number;
  notes?: string | null;
}

/** Accept either ratio (0..1) or percent (1..100) and normalise to ratio. */
function normalizePercent(input: unknown): number | null {
  if (input == null || input === "") return null;
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 1) return n / 100; // user typed e.g. 5 -> 0.05
  return n;
}

function validMonth(m: number | undefined): boolean {
  return Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 12;
}

function validYear(y: number | undefined): boolean {
  return Number.isInteger(y) && (y as number) >= 2000 && (y as number) <= 2100;
}

/**
 * GET /api/accounting/payroll/:partyId/deductions
 * Returns all deductions configured for the employee plus per-row progress
 * (sum of prior applications + last applied month).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    await requirePermission("accounting.parties:view");

    const { partyId: partyIdStr } = await params;
    const partyId = parseInt(partyIdStr, 10);
    if (isNaN(partyId)) return badRequest("Invalid party ID");

    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party || party.type !== "employee") {
      return badRequest("الموظف غير موجود", 404);
    }

    const deductions = await prisma.payrollDeduction.findMany({
      where: { partyId },
      include: {
        liabilityAccount: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ isActive: "desc" }, { priority: "asc" }, { id: "asc" }],
    });

    const withProgress = await Promise.all(
      deductions.map(async (d) => {
        const progress = await getDeductionProgress(prisma, d.id);
        return {
          id: d.id,
          name: d.name,
          category: d.category,
          calcType: d.calcType,
          amount: d.amount,
          percent: d.percent,
          mode: d.mode,
          totalAmount: d.totalAmount,
          startYear: d.startYear,
          startMonth: d.startMonth,
          endYear: d.endYear,
          endMonth: d.endMonth,
          priority: d.priority,
          isActive: d.isActive,
          notes: d.notes,
          liabilityAccount: d.liabilityAccount,
          appliedSoFar: progress.appliedSoFar,
          lastAppliedAt: progress.lastAppliedAt,
          remaining:
            d.mode === "installment" && d.totalAmount != null
              ? Math.max(
                  0,
                  Math.round((d.totalAmount - progress.appliedSoFar) * 100) /
                    100
                )
              : null,
        };
      })
    );

    return NextResponse.json({
      party: { id: party.id, name: party.name, isActive: party.isActive },
      deductions: withProgress,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET deductions error:", error);
    return NextResponse.json(
      { error: "فشل تحميل الاقتطاعات" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/accounting/payroll/:partyId/deductions
 * Create a new deduction rule.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const session = await requirePermission(
      "accounting.parties:manage_deductions"
    );
    const userId = Number((session.user as { id?: string | number }).id) || null;

    const { partyId: partyIdStr } = await params;
    const partyId = parseInt(partyIdStr, 10);
    if (isNaN(partyId)) return badRequest("Invalid party ID");

    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party || party.type !== "employee") {
      return badRequest("الموظف غير موجود", 404);
    }

    const body = (await req.json().catch(() => ({}))) as CreateBody;

    const name = (body.name ?? "").toString().trim();
    if (!name) return badRequest("الاسم مطلوب");
    if (name.length > 120) return badRequest("الاسم طويل جداً");

    const category = (body.category ?? "other").toString();
    if (!VALID_CATEGORIES.has(category))
      return badRequest("الفئة غير صالحة");

    const calcType = (body.calcType ?? "").toString();
    if (!VALID_CALC_TYPES.has(calcType))
      return badRequest("نوع الحساب غير صالح");

    const mode = (body.mode ?? "continuous").toString();
    if (!VALID_MODES.has(mode)) return badRequest("الوضع غير صالح");

    let amount: number | null = null;
    let percent: number | null = null;
    if (calcType === "fixed") {
      amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0)
        return badRequest("المبلغ الشهري يجب أن يكون أكبر من صفر");
    } else {
      percent = normalizePercent(body.percent);
      if (percent == null || percent <= 0 || percent > 1)
        return badRequest("النسبة يجب أن تكون بين 0 و 100%");
    }

    let totalAmount: number | null = null;
    if (mode === "installment") {
      totalAmount = Number(body.totalAmount);
      if (!Number.isFinite(totalAmount) || totalAmount <= 0)
        return badRequest("المبلغ الإجمالي للأقساط مطلوب");
    }

    if (!validYear(body.startYear) || !validMonth(body.startMonth))
      return badRequest("تاريخ البدء غير صالح");

    let endYear: number | null = null;
    let endMonth: number | null = null;
    if (body.endYear != null && body.endMonth != null) {
      if (!validYear(body.endYear) || !validMonth(body.endMonth))
        return badRequest("تاريخ الانتهاء غير صالح");
      const startKey = (body.startYear as number) * 12 + (body.startMonth as number);
      const endKey = body.endYear * 12 + body.endMonth;
      if (endKey < startKey)
        return badRequest("تاريخ الانتهاء قبل تاريخ البدء");
      endYear = body.endYear;
      endMonth = body.endMonth;
    }

    // Resolve liability account: explicit id > code > default fallback
    let liabilityAccountId: number | null = null;
    if (body.liabilityAccountId != null) {
      const acc = await prisma.account.findUnique({
        where: { id: Number(body.liabilityAccountId) },
      });
      if (!acc) return badRequest("حساب الخصوم غير موجود");
      if (acc.type !== "liability")
        return badRequest("الحساب يجب أن يكون من نوع خصوم");
      liabilityAccountId = acc.id;
    } else if (body.liabilityAccountCode) {
      const acc = await prisma.account.findUnique({
        where: { code: String(body.liabilityAccountCode) },
      });
      if (!acc) return badRequest("حساب الخصوم غير موجود");
      if (acc.type !== "liability")
        return badRequest("الحساب يجب أن يكون من نوع خصوم");
      liabilityAccountId = acc.id;
    } else {
      // Auto-pick a sensible default per category
      const defaultByCategory: Record<string, string> = {
        insurance: ACCOUNT_CODES.LIABILITY_HEALTH_INSURANCE,
        court: ACCOUNT_CODES.LIABILITY_COURT,
        permit: ACCOUNT_CODES.LIABILITY_PERMITS,
        loan: ACCOUNT_CODES.LIABILITY_DEDUCTIONS_OTHER,
        other: ACCOUNT_CODES.LIABILITY_DEDUCTIONS_OTHER,
      };
      const code =
        defaultByCategory[category] ??
        ACCOUNT_CODES.LIABILITY_DEDUCTIONS_OTHER;
      const acc = await prisma.account.findUnique({ where: { code } });
      liabilityAccountId = acc?.id ?? null;
    }

    const priority = Number.isInteger(body.priority)
      ? (body.priority as number)
      : 100;

    const created = await prisma.payrollDeduction.create({
      data: {
        partyId,
        name,
        category,
        calcType,
        amount,
        percent,
        mode,
        totalAmount,
        startYear: body.startYear as number,
        startMonth: body.startMonth as number,
        endYear,
        endMonth,
        liabilityAccountId,
        priority,
        notes: body.notes ? String(body.notes).slice(0, 500) : null,
        createdById: userId,
      },
      include: {
        liabilityAccount: { select: { id: true, code: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, deduction: created });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST deductions error:", error);
    const msg = error instanceof Error ? error.message : "فشل إنشاء الاقتطاع";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
