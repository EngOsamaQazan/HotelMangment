require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();
  try {
    const units = await prisma.unit.findMany({
      include: { unitTypeRef: { select: { category: true, code: true } } },
      orderBy: [{ unitTypeRef: { category: "asc" } }, { unitNumber: "asc" }],
    });
    console.log(`الوحدات (${units.length}):`);
    console.table(
      units.map((u) => ({
        number: u.unitNumber,
        type:
          u.unitTypeRef?.category === "apartment" ? "apartment" : "room",
        category: u.unitTypeRef?.category ?? "—",
        code: u.unitTypeRef?.code ?? "—",
        status: u.status,
        floor: u.floor,
      })),
    );

    const income = await prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: "income" } });
    const totalPaidAgg = await prisma.reservation.aggregate({ _sum: { paidAmount: true, totalAmount: true, remaining: true } });

    console.log("\nإجماليات الحجوزات (37 حجز):");
    console.table({
      إجمالي_المبالغ_المستحقة: totalPaidAgg._sum.totalAmount,
      المدفوع: totalPaidAgg._sum.paidAmount,
      المتبقي: totalPaidAgg._sum.remaining,
      دخل_مسجَّل_في_الحركات: income._sum.amount,
    });

    const top = await prisma.reservation.findMany({
      where: { remaining: { gt: 0 } },
      orderBy: { remaining: "desc" },
      take: 5,
      include: { unit: true },
    });
    if (top.length) {
      console.log("\nأكبر المتبقيات:");
      console.table(
        top.map((r) => ({ الاسم: r.guestName, وحدة: r.unit.unitNumber, متبقي: r.remaining })),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
})();
