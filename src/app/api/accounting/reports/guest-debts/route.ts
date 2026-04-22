import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { ACCOUNT_CODES } from "@/lib/accounting";

/**
 * تقرير ذمم الضيوف (تفصيل بالحجز)
 *
 * يدمج:
 * - بيانات تشغيلية من جدول reservation (رقم الغرفة، التواريخ، اسم الضيف)
 * - الرصيد المحاسبي الحقيقي من قيود حساب 1100 "ذمم الضيوف"
 *
 * الهدف: إعطاء عرض عملياتي (لمكتب الاستقبال) مرتبط بالنظام المحاسبي الرسمي،
 * مع الإشارة إلى أي فروقات بين reservation.remaining والرصيد المحاسبي.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("reports.debts:view");
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("asOf");
    const includeSettled = searchParams.get("includeSettled") === "1";
    const asOfDate = asOf ? new Date(asOf) : undefined;

    const arAccount = await prisma.account.findUnique({
      where: { code: ACCOUNT_CODES.AR_GUESTS },
    });

    const reservations = await prisma.reservation.findMany({
      where: includeSettled
        ? {}
        : { remaining: { gt: 0 } },
      include: {
        unit: true,
      },
      orderBy: { remaining: "desc" },
    });

    const rows = await Promise.all(
      reservations.map(async (r) => {
        let accountingBalance = 0;
        let partyId: number | null = null;

        if (arAccount) {
          const lines = await prisma.journalLine.findMany({
            where: {
              accountId: arAccount.id,
              entry: {
                status: "posted",
                OR: [
                  { source: "reservation", sourceRefId: r.id },
                  { source: "payment", sourceRefId: r.id },
                ],
                ...(asOfDate ? { date: { lte: asOfDate } } : {}),
              },
            },
            select: { debit: true, credit: true, partyId: true },
          });

          for (const l of lines) {
            accountingBalance += Number(l.debit) - Number(l.credit);
            if (l.partyId && partyId === null) {
              partyId = l.partyId;
            }
          }
        }

        const remaining = Number(r.remaining);
        const mismatch = Math.abs(remaining - accountingBalance) > 0.01;

        return {
          id: r.id,
          guestName: r.guestName,
          phone: r.phone,
          totalAmount: String(r.totalAmount),
          paidAmount: String(r.paidAmount),
          remaining: String(r.remaining),
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          status: r.status,
          unit: r.unit
            ? {
                id: r.unit.id,
                unitNumber: r.unit.unitNumber,
                unitType: r.unit.unitType,
              }
            : null,
          accountingBalance: Math.round(accountingBalance * 100) / 100,
          partyId,
          mismatch,
        };
      })
    );

    const filtered = includeSettled
      ? rows
      : rows.filter((r) => Number(r.remaining) > 0 || r.accountingBalance > 0);

    const totalRemaining = filtered.reduce(
      (sum, r) => sum + Number(r.remaining),
      0
    );
    const totalAccounting = filtered.reduce(
      (sum, r) => sum + r.accountingBalance,
      0
    );
    const mismatchCount = filtered.filter((r) => r.mismatch).length;

    return NextResponse.json({
      asOf: asOfDate ?? null,
      count: filtered.length,
      totalRemaining: Math.round(totalRemaining * 100) / 100,
      totalAccounting: Math.round(totalAccounting * 100) / 100,
      mismatchCount,
      reservations: filtered,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/reports/guest-debts error:", error);
    return NextResponse.json(
      { error: "Failed to generate guest debts report" },
      { status: 500 }
    );
  }
}
