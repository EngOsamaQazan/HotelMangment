import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_CODES, postEntry } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { computePayrollDeductions } from "@/lib/payroll/deductions";

/**
 * POST /api/accounting/payroll/:partyId/post
 * Body: { year, month, basePay?, commission?, advanceDeduction?, paymentAccount?, date?, note? }
 *
 * Creates two journal entries:
 *  1) Salary accrual:
 *     DR 5010 salaries expense   gross
 *     CR 2110 employee liability gross
 *  2) Salary payment:
 *     DR 2110 employee liability   (gross − advanceDeduction)   (settles employee's claim)
 *     CR liability account(s)      (one line per deduction)
 *     CR cash/bank/wallet          (net = gross − advance − totalDeductions)
 *
 *  The DR-2110 by (gross − advance) automatically clears any earlier advance
 *  recorded as DR-2110/CR-cash, so the employee's balance on 2110 returns to 0
 *  after the salary closes.
 *
 * Convention for 2110 (AP Employees — liability):
 *   - CR 2110 when salary is accrued (increases what we owe)
 *   - DR 2110 when we pay the employee (reduces what we owe)
 *   - DR 2110 when we give an advance (creates claim on employee)
 *
 * Configured deductions (continuous + installments) are computed inside the
 * transaction via `computePayrollDeductions`. After posting, one
 * `PayrollDeductionApplication` row is recorded per deduction so installment
 * progress and idempotency can be tracked.
 *
 * All amounts in JOD.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const session = await requirePermission("accounting.parties:edit");
    const userId = Number((session.user as { id?: string | number }).id) || null;

    const { partyId: partyIdStr } = await params;
    const partyId = parseInt(partyIdStr, 10);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid party ID" }, { status: 400 });
    }

    const party = await prisma.party.findUnique({ where: { id: partyId } });
    if (!party || party.type !== "employee") {
      return NextResponse.json({ error: "الموظف غير موجود" }, { status: 404 });
    }

    const body = await req.json();
    const year = Number(body.year);
    const month = Number(body.month);
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year/month مطلوبان" }, { status: 400 });
    }
    const basePay = Number(body.basePay ?? 0);
    const commission = Number(body.commission ?? 0);
    const advanceDeduction = Number(body.advanceDeduction ?? 0);
    const paymentAccountCode = body.paymentAccount || "1010"; // default cash
    const dateStr = body.date || new Date().toISOString().slice(0, 10);
    const date = new Date(dateStr);
    const note = body.note || "";

    if (basePay < 0 || commission < 0 || advanceDeduction < 0) {
      return NextResponse.json({ error: "قيم سالبة غير مسموحة" }, { status: 400 });
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const accrualAmount = round2(basePay + commission);
    const monthLabel = `${month}/${year}`;

    // idempotency check: see if there's already an accrual for this party/month
    const existingAccrual = await prisma.journalEntry.findFirst({
      where: {
        source: "salary",
        reference: `SAL-${partyId}-${year}-${month}`,
        status: "posted",
      },
    });
    if (existingAccrual) {
      return NextResponse.json(
        {
          error: `راتب هذا الشهر (${monthLabel}) مسجّل مسبقاً عبر القيد ${existingAccrual.entryNumber}`,
        },
        { status: 400 }
      );
    }

    // also reject if any deduction application exists for this month (defensive
    // guard in case the accrual was voided but applications were not)
    const existingApps = await prisma.payrollDeductionApplication.findFirst({
      where: { partyId, year, month },
    });
    if (existingApps) {
      return NextResponse.json(
        {
          error: `يوجد تطبيق اقتطاعات سابق لهذا الشهر (${monthLabel}) — يجب عكسه أولاً`,
        },
        { status: 400 }
      );
    }

    const results: { accrual?: number; payment?: number } = {};
    const appliedDeductions: Array<{
      deductionId: number;
      amount: number;
      name: string;
    }> = [];

    // Default fallback liability account (2150 خصومات راتب أخرى) — resolved once.
    const fallbackAcc = await prisma.account.findUnique({
      where: { code: ACCOUNT_CODES.LIABILITY_DEDUCTIONS_OTHER },
    });

    await prisma.$transaction(async (tx) => {
      // 1) Compute deductions for this month against the gross.
      const computed = await computePayrollDeductions(
        tx,
        partyId,
        year,
        month,
        accrualAmount
      );

      const totalDeductions = computed.total;
      const paymentAmount = round2(
        accrualAmount - advanceDeduction
      ); // DR 2110 in payment entry
      const cashAmount = round2(paymentAmount - totalDeductions); // net to employee

      if (cashAmount < 0) {
        throw new Error(
          "إجمالي الاقتطاعات والسلف أكبر من الراتب — لا يمكن إصدار صرف بقيمة سالبة"
        );
      }

      // 2) Accrual entry (if any salary)
      if (accrualAmount > 0) {
        const accrual = await postEntry(tx, {
          date,
          description: `استحقاق راتب ${party.name} عن شهر ${monthLabel}${
            note ? ` — ${note}` : ""
          }`,
          source: "salary",
          sourceRefId: partyId,
          reference: `SAL-${partyId}-${year}-${month}`,
          createdById: userId,
          lines: [
            {
              accountCode: ACCOUNT_CODES.EXPENSE_SALARIES,
              partyId,
              debit: accrualAmount,
              description: `راتب ${party.name} ${monthLabel}`,
            },
            {
              accountCode: ACCOUNT_CODES.AP_EMPLOYEES,
              partyId,
              credit: accrualAmount,
              description: `استحقاق راتب ${monthLabel}`,
            },
          ],
        });
        results.accrual = accrual.id;
      }

      // 3) Payment entry (only if there's a non-zero settlement). When
      //    paymentAmount is 0 (e.g. salary fully consumed by advance) we still
      //    skip — the prior advance + accrual already net out on 2110.
      if (paymentAmount > 0) {
        const noteParts: string[] = [];
        if (advanceDeduction > 0)
          noteParts.push(`بعد خصم سلف ${advanceDeduction}`);
        if (totalDeductions > 0)
          noteParts.push(`بعد اقتطاعات ${totalDeductions}`);
        const desc = `صرف راتب ${party.name} عن شهر ${monthLabel}${
          noteParts.length ? ` (${noteParts.join("، ")})` : ""
        }`;

        const lines: Parameters<typeof postEntry>[1]["lines"] = [
          {
            accountCode: ACCOUNT_CODES.AP_EMPLOYEES,
            partyId,
            debit: paymentAmount,
            description: `صرف راتب ${monthLabel}`,
          },
        ];

        // One CR line per deduction (target liability account or fallback)
        for (const item of computed.items) {
          const accId =
            item.deduction.liabilityAccountId ?? fallbackAcc?.id;
          if (!accId) {
            throw new Error(
              `لا يوجد حساب خصوم محدد للاقتطاع "${item.deduction.name}" ولا حساب 2150 افتراضي`
            );
          }
          lines.push({
            accountId: accId,
            partyId,
            credit: item.amount,
            description: `اقتطاع: ${item.deduction.name} — ${monthLabel}`,
          });
          appliedDeductions.push({
            deductionId: item.deduction.id,
            amount: item.amount,
            name: item.deduction.name,
          });
        }

        // Cash/bank/wallet line — only emit if > 0 (employee actually receives money)
        if (cashAmount > 0) {
          lines.push({
            accountCode: paymentAccountCode,
            credit: cashAmount,
            description: `صرف راتب ${party.name}`,
          });
        } else if (totalDeductions < paymentAmount) {
          // Edge: paymentAmount > 0 but cashAmount somehow rounded to 0 — keep one
          // tiny rounding line via cash to keep balance.
          lines.push({
            accountCode: paymentAccountCode,
            credit: 0,
            description: `صرف راتب ${party.name}`,
          });
        }

        const payment = await postEntry(tx, {
          date,
          description: desc,
          source: "salary",
          sourceRefId: partyId,
          reference: `SAL-${partyId}-${year}-${month}-PAY`,
          createdById: userId,
          lines,
        });
        results.payment = payment.id;

        // 4) Persist applications (audit + idempotency + installment progress).
        for (const item of computed.items) {
          await tx.payrollDeductionApplication.create({
            data: {
              deductionId: item.deduction.id,
              partyId,
              year,
              month,
              appliedAmount: item.amount,
              journalEntryId: payment.id,
            },
          });
        }

        // 5) Auto-deactivate installment deductions that hit their cap.
        for (const item of computed.items) {
          if (item.deduction.mode === "installment") {
            const newApplied = round2(
              item.appliedSoFar + item.amount
            );
            const total = Number(item.deduction.totalAmount ?? 0);
            if (newApplied + 0.005 >= total) {
              await tx.payrollDeduction.update({
                where: { id: item.deduction.id },
                data: {
                  isActive: false,
                  endYear: item.deduction.endYear ?? year,
                  endMonth: item.deduction.endMonth ?? month,
                },
              });
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      accrualAmount,
      advanceDeduction,
      deductions: appliedDeductions,
      totalDeductions: appliedDeductions.reduce((s, d) => s + d.amount, 0),
      entries: results,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/accounting/payroll/[partyId]/post error:", error);
    const msg = error instanceof Error ? error.message : "فشل تسجيل الراتب";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
