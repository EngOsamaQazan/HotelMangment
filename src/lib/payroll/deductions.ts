import type { Prisma, PrismaClient, PayrollDeduction } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export type DeductionCalcType = "fixed" | "percent_gross" | "percent_net";
export type DeductionMode = "continuous" | "installment";

export interface ComputedDeductionItem {
  deduction: PayrollDeduction;
  amount: number;
  /** When the rule resolved to less than its nominal value (e.g. capped to remaining installment debt). */
  cappedReason?: "installment_remaining" | "gross_exhausted";
  /** Cumulative amount applied prior to this month (installments only). */
  appliedSoFar: number;
  /** Remaining debt after this month's amount (installments only, otherwise 0). */
  remainingAfter: number;
}

export interface ComputeDeductionsResult {
  items: ComputedDeductionItem[];
  total: number;
}

const EPS = 0.005;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Returns true when (year, month) is inside the deduction's [start, end] window.
 * `endYear/endMonth = null` means open-ended.
 */
function isWithinWindow(d: PayrollDeduction, year: number, month: number): boolean {
  const ym = year * 12 + (month - 1);
  const start = d.startYear * 12 + (d.startMonth - 1);
  if (ym < start) return false;
  if (d.endYear == null || d.endMonth == null) return true;
  const end = d.endYear * 12 + (d.endMonth - 1);
  return ym <= end;
}

/**
 * Sum of `appliedAmount` for prior months (strictly before the given y/m).
 */
async function sumPriorApplications(
  tx: Tx,
  deductionId: number,
  year: number,
  month: number
): Promise<number> {
  const ym = year * 12 + (month - 1);
  const apps = await tx.payrollDeductionApplication.findMany({
    where: { deductionId },
    select: { year: true, month: true, appliedAmount: true },
  });
  let sum = 0;
  for (const a of apps) {
    if (a.year * 12 + (a.month - 1) < ym) sum += a.appliedAmount;
  }
  return sum;
}

/**
 * Compute every deduction line that should apply for the given employee in (year, month).
 *
 * Ordering rule: `fixed` and `percent_gross` are evaluated first (in their `priority` order),
 * then `percent_net` (also in `priority` order). This makes "نسبة من الصافي بعد اقتطاع
 * التأمينات والاقتطاعات الأخرى" deterministic without relying on user-set priorities to
 * cross calc-type boundaries.
 *
 * Caller is responsible for subtracting the returned `total` from `gross` (and any
 * outstanding advance) to get the final net pay.
 */
export async function computePayrollDeductions(
  tx: Tx,
  partyId: number,
  year: number,
  month: number,
  gross: number
): Promise<ComputeDeductionsResult> {
  const all = await tx.payrollDeduction.findMany({
    where: { partyId, isActive: true },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });

  const eligible = all.filter((d) => isWithinWindow(d, year, month));

  const grossFirst = eligible.filter(
    (d) => d.calcType === "fixed" || d.calcType === "percent_gross"
  );
  const netLast = eligible.filter((d) => d.calcType === "percent_net");

  const items: ComputedDeductionItem[] = [];
  let cumulative = 0;

  for (const d of [...grossFirst, ...netLast]) {
    let amount: number;
    if (d.calcType === "fixed") {
      amount = Number(d.amount ?? 0);
    } else if (d.calcType === "percent_gross") {
      amount = Number(d.percent ?? 0) * gross;
    } else {
      // percent_net — base = gross minus all earlier deductions
      const baseSoFar = Math.max(0, gross - cumulative);
      amount = Number(d.percent ?? 0) * baseSoFar;
    }

    let cappedReason: ComputedDeductionItem["cappedReason"];
    let appliedSoFar = 0;
    let remainingAfter = 0;

    if (d.mode === "installment") {
      const total = Number(d.totalAmount ?? 0);
      appliedSoFar = await sumPriorApplications(tx, d.id, year, month);
      const remaining = Math.max(0, total - appliedSoFar);
      if (amount > remaining + EPS) {
        amount = remaining;
        cappedReason = "installment_remaining";
      }
      remainingAfter = Math.max(0, remaining - amount);
    }

    // Final guard against over-deducting beyond gross
    const headroom = Math.max(0, gross - cumulative);
    if (amount > headroom + EPS) {
      amount = headroom;
      cappedReason = cappedReason ?? "gross_exhausted";
    }

    amount = round2(Math.max(0, amount));
    if (amount <= EPS) continue;

    items.push({
      deduction: d,
      amount,
      cappedReason,
      appliedSoFar: round2(appliedSoFar),
      remainingAfter: round2(remainingAfter),
    });
    cumulative += amount;
  }

  return { items, total: round2(cumulative) };
}

/**
 * Convenience helper used by the UI to derive next-month status (e.g. progress bar).
 * Does NOT take gross into account; it just reports installment progress.
 */
export async function getDeductionProgress(
  tx: Tx,
  deductionId: number
): Promise<{ appliedSoFar: number; lastAppliedAt: { year: number; month: number } | null }> {
  const apps = await tx.payrollDeductionApplication.findMany({
    where: { deductionId },
    select: { year: true, month: true, appliedAmount: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  const appliedSoFar = round2(apps.reduce((s, a) => s + a.appliedAmount, 0));
  const lastAppliedAt = apps[0] ? { year: apps[0].year, month: apps[0].month } : null;
  return { appliedSoFar, lastAppliedAt };
}
