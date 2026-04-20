import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_CODES, postEntry } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * POST /api/accounting/payroll/:partyId/post
 * Body: { year, month, basePay?, commission?, advanceDeduction?, paymentAccount?, date?, note? }
 *
 * Creates two journal entries:
 *  1) Salary accrual: DR 5010 salaries expense / CR 2110 employee liability
 *  2) Salary payment: DR 2110 / CR cash (or bank)
 *     If advanceDeduction > 0 and there is an outstanding advance on 2110 for the party
 *     (negative balance), we simply reduce the payment amount by the advance (already recorded
 *     as a DR on 2110 from prior advance). That auto-reconciles.
 *
 * Net payment to employee = basePay + commission - advanceDeduction
 *
 * Convention for 2110 (AP Employees — liability):
 *   - CR 2110 when salary is accrued (increases what we owe)
 *   - DR 2110 when we pay the employee (reduces what we owe)
 *   - DR 2110 when we give an advance (creates claim on employee)
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

    const accrualAmount = Math.round((basePay + commission) * 100) / 100;
    const paymentAmount =
      Math.round((basePay + commission - advanceDeduction) * 100) / 100;

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

    const results: { accrual?: number; payment?: number } = {};

    await prisma.$transaction(async (tx) => {
      // 1) Accrual entry (if amount > 0)
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

      // 2) Payment entry (only if paymentAmount > 0)
      if (paymentAmount > 0) {
        const payment = await postEntry(tx, {
          date,
          description: `صرف راتب ${party.name} عن شهر ${monthLabel}${
            advanceDeduction > 0 ? ` (بعد خصم سلف ${advanceDeduction})` : ""
          }`,
          source: "salary",
          sourceRefId: partyId,
          reference: `SAL-${partyId}-${year}-${month}-PAY`,
          createdById: userId,
          lines: [
            {
              accountCode: ACCOUNT_CODES.AP_EMPLOYEES,
              partyId,
              debit: paymentAmount,
              description: `صرف راتب ${monthLabel}`,
            },
            {
              accountCode: paymentAccountCode,
              credit: paymentAmount,
              description: `صرف راتب ${party.name}`,
            },
          ],
        });
        results.payment = payment.id;
      }

      // 3) If advanceDeduction > 0, we need a "clearing" entry:
      //    The advance was previously DR 2110 / CR cash.
      //    When salary is paid netted, we implicitly cancel the advance by reducing the payment.
      //    But the 2110 balance still shows the DR from the advance. We need to CR 2110 and
      //    DR ... what? The accrual already CR'd 2110 for the full salary. The payment DR'd 2110
      //    for (base+comm - advance). Net effect on 2110:
      //       CR (accrualAmount) - DR (paymentAmount) = CR (advanceDeduction)
      //    If the advance was initially DR advanceDeduction, then after this:
      //       DR (advance) - CR (advanceDeduction now from netting) = 0  ✅ CLEAN
      //
      //    So NO extra clearing entry needed. The math works out.
    });

    return NextResponse.json({
      success: true,
      accrualAmount,
      paymentAmount,
      advanceDeduction,
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
