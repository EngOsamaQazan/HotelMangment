import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACCOUNT_CODES, postEntry } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * POST /api/accounting/payroll/:partyId/advance
 *
 * Records a salary advance paid to an employee.
 *
 * Body: { amount: number, paymentAccount?: "1010"|"1020"|"1030", date?: "YYYY-MM-DD", note?: string }
 *
 * The advance is NOT an expense — it's a temporary claim on the employee
 * (a debit on the employee liability account 2110, with partyId for tracking).
 * It will be auto-recovered when the next payroll is posted via the
 * `advanceDeduction` flow in `payroll/[partyId]/post`.
 *
 * Journal entry:
 *   DR 2110 مستحقات الموظفين  (with partyId)   ─── creates claim on employee
 *   CR 1010/1020/1030 (cash / bank / wallet)   ─── pays out the advance
 *
 * All amounts in JOD.
 */
const ALLOWED_PAYMENT_ACCOUNTS = new Set([
  ACCOUNT_CODES.CASH,
  ACCOUNT_CODES.BANK,
  // Wallet is "1030" — kept as string here to avoid extending ACCOUNT_CODES.
  "1030",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const session = await requirePermission("accounting.parties:advance");
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
    if (!party.isActive) {
      return NextResponse.json(
        { error: "لا يمكن صرف سلفة لموظف غير نشط" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "المبلغ مطلوب ويجب أن يكون أكبر من صفر" },
        { status: 400 }
      );
    }
    const rounded = Math.round(amount * 100) / 100;

    const paymentAccountCode = String(body.paymentAccount || ACCOUNT_CODES.CASH);
    if (!ALLOWED_PAYMENT_ACCOUNTS.has(paymentAccountCode)) {
      return NextResponse.json(
        { error: "حساب الدفع غير صالح (يجب صندوق/بنك/محفظة)" },
        { status: 400 }
      );
    }

    const dateStr =
      typeof body.date === "string" && body.date.trim()
        ? body.date
        : new Date().toISOString().slice(0, 10);
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "تاريخ غير صالح" }, { status: 400 });
    }

    const note =
      typeof body.note === "string" ? body.note.trim().slice(0, 280) : "";

    const baseDescription = `صرف سلفة للموظف ${party.name}`;
    const description = note ? `${baseDescription} — ${note}` : baseDescription;

    const result = await prisma.$transaction(async (tx) => {
      const entry = await postEntry(tx, {
        date,
        description,
        source: "advance",
        sourceRefId: partyId,
        reference: `ADV-${partyId}-${Date.now()}`,
        createdById: userId,
        lines: [
          {
            accountCode: ACCOUNT_CODES.AP_EMPLOYEES,
            partyId,
            debit: rounded,
            description: `سلفة للموظف ${party.name}`,
          },
          {
            accountCode: paymentAccountCode,
            credit: rounded,
            description: `صرف سلفة — ${party.name}`,
          },
        ],
      });
      return entry;
    });

    return NextResponse.json({
      success: true,
      amount: rounded,
      paymentAccount: paymentAccountCode,
      date: dateStr,
      entry: { id: result.id, entryNumber: result.entryNumber },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/accounting/payroll/[partyId]/advance error:", error);
    const msg = error instanceof Error ? error.message : "فشل تسجيل السلفة";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
