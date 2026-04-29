import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

interface UpdateBody {
  name?: string;
  notes?: string | null;
  priority?: number;
  isActive?: boolean;
  endYear?: number | null;
  endMonth?: number | null;
  liabilityAccountId?: number | null;
}

function validMonth(m: unknown): boolean {
  return Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 12;
}

function validYear(y: unknown): boolean {
  return Number.isInteger(y) && (y as number) >= 2000 && (y as number) <= 2100;
}

async function loadDeductionOr404(partyId: number, id: number) {
  const d = await prisma.payrollDeduction.findUnique({ where: { id } });
  if (!d || d.partyId !== partyId) return null;
  return d;
}

/**
 * PUT /api/accounting/payroll/:partyId/deductions/:id
 * Edits a deduction. Core fields (calcType, amount, percent, mode, totalAmount,
 * startYear/Month) are immutable once any application has been recorded — the
 * user must end the current rule and create a new one instead.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ partyId: string; id: string }> }
) {
  try {
    await requirePermission("accounting.parties:manage_deductions");

    const { partyId: partyIdStr, id: idStr } = await params;
    const partyId = parseInt(partyIdStr, 10);
    const id = parseInt(idStr, 10);
    if (isNaN(partyId) || isNaN(id))
      return badRequest("معرّفات غير صالحة");

    const existing = await loadDeductionOr404(partyId, id);
    if (!existing) return badRequest("الاقتطاع غير موجود", 404);

    const body = (await req.json().catch(() => ({}))) as UpdateBody;

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return badRequest("الاسم مطلوب");
      if (name.length > 120) return badRequest("الاسم طويل جداً");
      data.name = name;
    }

    if (body.notes !== undefined) {
      data.notes = body.notes ? String(body.notes).slice(0, 500) : null;
    }

    if (body.priority !== undefined) {
      if (!Number.isInteger(body.priority))
        return badRequest("priority غير صالحة");
      data.priority = body.priority;
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    if (body.endYear !== undefined || body.endMonth !== undefined) {
      if (body.endYear == null && body.endMonth == null) {
        data.endYear = null;
        data.endMonth = null;
      } else {
        if (!validYear(body.endYear) || !validMonth(body.endMonth))
          return badRequest("تاريخ الانتهاء غير صالح");
        const startKey = existing.startYear * 12 + existing.startMonth;
        const endKey = (body.endYear as number) * 12 + (body.endMonth as number);
        if (endKey < startKey)
          return badRequest("تاريخ الانتهاء قبل تاريخ البدء");
        data.endYear = body.endYear;
        data.endMonth = body.endMonth;
      }
    }

    if (body.liabilityAccountId !== undefined) {
      if (body.liabilityAccountId == null) {
        data.liabilityAccountId = null;
      } else {
        const acc = await prisma.account.findUnique({
          where: { id: Number(body.liabilityAccountId) },
        });
        if (!acc) return badRequest("حساب الخصوم غير موجود");
        if (acc.type !== "liability")
          return badRequest("الحساب يجب أن يكون من نوع خصوم");
        data.liabilityAccountId = acc.id;
      }
    }

    if (Object.keys(data).length === 0)
      return badRequest("لا توجد تغييرات");

    const updated = await prisma.payrollDeduction.update({
      where: { id },
      data,
      include: {
        liabilityAccount: { select: { id: true, code: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, deduction: updated });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT deduction error:", error);
    const msg = error instanceof Error ? error.message : "فشل تعديل الاقتطاع";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/accounting/payroll/:partyId/deductions/:id
 * Soft-deletes (sets isActive=false). Hard delete is allowed only when no
 * applications have been recorded yet (no audit trail to preserve).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ partyId: string; id: string }> }
) {
  try {
    await requirePermission("accounting.parties:manage_deductions");

    const { partyId: partyIdStr, id: idStr } = await params;
    const partyId = parseInt(partyIdStr, 10);
    const id = parseInt(idStr, 10);
    if (isNaN(partyId) || isNaN(id)) return badRequest("معرّفات غير صالحة");

    const existing = await loadDeductionOr404(partyId, id);
    if (!existing) return badRequest("الاقتطاع غير موجود", 404);

    const appCount = await prisma.payrollDeductionApplication.count({
      where: { deductionId: id },
    });

    if (appCount === 0) {
      await prisma.payrollDeduction.delete({ where: { id } });
      return NextResponse.json({ success: true, mode: "hard_delete" });
    }

    const now = new Date();
    const updated = await prisma.payrollDeduction.update({
      where: { id },
      data: {
        isActive: false,
        endYear: existing.endYear ?? now.getFullYear(),
        endMonth: existing.endMonth ?? now.getMonth() + 1,
      },
    });
    return NextResponse.json({
      success: true,
      mode: "soft_delete",
      deduction: updated,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE deduction error:", error);
    const msg = error instanceof Error ? error.message : "فشل حذف الاقتطاع";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
