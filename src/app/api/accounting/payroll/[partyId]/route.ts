import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_CODES } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { computePayrollDeductions } from "@/lib/payroll/deductions";

/**
 * GET /api/accounting/payroll/:partyId?year=2026&month=4
 * Returns a payslip computation for the given employee and month.
 *
 * Logic:
 *  - baseSalary: from Party.baseSalary
 *  - commission: (commissionRate ?? 0) * (sum of CR on revenue account 4010 during month)
 *    where the commission-eligible revenue is total room revenue posted in the period.
 *  - advances: net DR on account 2110 (Employee Liabilities) for this party
 *    during the month = amount paid as advance in the month (not yet recovered).
 *    We include all DR lines since party was hired (or always) MINUS CR lines (recoveries).
 *    For the payslip, we show the CURRENT outstanding advance balance (across all time)
 *    since it carries over until cleared on payday.
 *  - paidSoFar: CR on 2110 for this party during the month
 *    (money paid to employee as salary settlement — credit side of the entry where DR cash or similar).
 *    Actually: when salary is paid, entry is DR 2110 (reduce liability) / CR cash.
 *    Hmm — the liability side depends on convention. We'll define clearly below.
 *
 * Convention used here for account 2110 (مستحقات الموظفين):
 *   - When we RECORD salary earned but not yet paid: CR 2110 / DR 5010 (expense).
 *   - When we PAY salary: DR 2110 / CR cash.
 *   - When we PAY advance: DR 2110 / CR cash (advance to employee reduces his liability balance,
 *     effectively putting him in "we claim from him" territory until next salary).
 *   - When we RECOVER advance at month-end: CR 2110 / DR 5010 (or reduce salary payment).
 *
 * So: partyBalance on 2110 = CR - DR = what hotel currently owes employee.
 *   - Positive (CR > DR) = hotel owes employee money.
 *   - Negative (DR > CR) = employee owes hotel (advance outstanding).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    await requirePermission("accounting.parties:view");

    const { partyId: partyIdStr } = await params;
    const partyId = parseInt(partyIdStr, 10);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid party ID" }, { status: 400 });
    }

    const url = new URL(_req.url);
    const year = parseInt(url.searchParams.get("year") || String(new Date().getFullYear()), 10);
    const month = parseInt(url.searchParams.get("month") || String(new Date().getMonth() + 1), 10);

    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party || party.type !== "employee") {
      return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
    }

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 1));

    // Fetch required accounts
    const [roomRevAcc, empLiabAcc] = await Promise.all([
      prisma.account.findUnique({ where: { code: ACCOUNT_CODES.REVENUE_ROOMS } }),
      prisma.account.findUnique({ where: { code: ACCOUNT_CODES.AP_EMPLOYEES } }),
    ]);

    // 1) Room revenue in period (sum of credit side on 4010)
    let roomRevenue = 0;
    if (roomRevAcc) {
      const agg = await prisma.journalLine.aggregate({
        where: {
          accountId: roomRevAcc.id,
          entry: {
            status: "posted",
            date: { gte: periodStart, lt: periodEnd },
          },
        },
        _sum: { debit: true, credit: true },
      });
      roomRevenue = Number(agg._sum.credit || 0) - Number(agg._sum.debit || 0);
    }

    const commissionRate = Number(party.commissionRate ?? 0);
    const baseSalary = Number(party.baseSalary ?? 0);
    const commission = Math.round(commissionRate * roomRevenue * 100) / 100;

    // 2) Outstanding advance (current balance on 2110 for this party, across all time)
    let empLiabBalance = 0; // positive = hotel owes, negative = advance outstanding
    let advancesThisPeriod = 0;
    let paymentsThisPeriod = 0;
    if (empLiabAcc) {
      const allAgg = await prisma.journalLine.aggregate({
        where: {
          accountId: empLiabAcc.id,
          partyId,
          entry: { status: "posted" },
        },
        _sum: { debit: true, credit: true },
      });
      empLiabBalance =
        Number(allAgg._sum.credit || 0) - Number(allAgg._sum.debit || 0);

      const periodAgg = await prisma.journalLine.aggregate({
        where: {
          accountId: empLiabAcc.id,
          partyId,
          entry: {
            status: "posted",
            date: { gte: periodStart, lt: periodEnd },
          },
        },
        _sum: { debit: true, credit: true },
      });
      // DR on 2110 during period = advances paid / salary payments (reduces liability)
      // CR on 2110 during period = salary accrued (increases liability)
      advancesThisPeriod = Number(periodAgg._sum.debit || 0);
      paymentsThisPeriod = Number(periodAgg._sum.credit || 0);
    }

    const outstandingAdvance = empLiabBalance < 0 ? -empLiabBalance : 0;

    // 3) Payslip: gross = base + commission
    const gross = Math.round((baseSalary + commission) * 100) / 100;

    // 4) Compute configured deductions (continuous + installments) for the month.
    const deductionsResult = await computePayrollDeductions(
      prisma,
      partyId,
      year,
      month,
      gross
    );

    // 5) Net = gross − totalDeductions − outstandingAdvance.
    const net =
      Math.round(
        (gross - deductionsResult.total - outstandingAdvance) * 100
      ) / 100;

    return NextResponse.json({
      party: {
        id: party.id,
        name: party.name,
        jobTitle: party.jobTitle,
        baseSalary,
        commissionRate,
        salaryPayDay: party.salaryPayDay,
        hireDate: party.hireDate,
        terminationDate: party.terminationDate,
        isActive: party.isActive,
      },
      period: {
        year,
        month,
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      roomRevenue: Math.round(roomRevenue * 100) / 100,
      baseSalary,
      commissionRate,
      commission,
      gross,
      outstandingAdvance: Math.round(outstandingAdvance * 100) / 100,
      empLiabBalance: Math.round(empLiabBalance * 100) / 100,
      advancesThisPeriod: Math.round(advancesThisPeriod * 100) / 100,
      paymentsThisPeriod: Math.round(paymentsThisPeriod * 100) / 100,
      deductions: deductionsResult.items.map((item) => ({
        id: item.deduction.id,
        name: item.deduction.name,
        category: item.deduction.category,
        calcType: item.deduction.calcType,
        mode: item.deduction.mode,
        amount: item.amount,
        cappedReason: item.cappedReason ?? null,
        appliedSoFar: item.appliedSoFar,
        remainingAfter: item.remainingAfter,
      })),
      totalDeductions: deductionsResult.total,
      net,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/payroll/[partyId] error:", error);
    return NextResponse.json({ error: "Failed to compute payroll" }, { status: 500 });
  }
}
