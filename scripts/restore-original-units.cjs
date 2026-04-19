/**
 * يحذف الوحدات التي لا تنتمي إلى الترقيم الأصلي (01–06 و101–109) بعد
 * حذف الحجوزات/النزلاء/الحركات المرتبطة بها. يُستخدم قبل إعادة استيراد
 * ملف الإكسل المحدّث.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");

const ORIGINAL = new Set([
  "01", "02", "03", "04", "05", "06",
  "101", "102", "103", "104", "105", "106", "107", "108", "109",
]);

(async () => {
  const prisma = new PrismaClient();
  try {
    const units = await prisma.unit.findMany();
    const extras = units.filter((u) => !ORIGINAL.has(u.unitNumber));
    console.log(`عدد الوحدات الكلّي: ${units.length}. الوحدات الإضافية المرشّحة للحذف: ${extras.length}`);
    if (extras.length === 0) {
      console.log("لا توجد وحدات إضافية.");
      return;
    }

    const ids = extras.map((u) => u.id);

    await prisma.$transaction(async (tx) => {
      const resIds = (
        await tx.reservation.findMany({ where: { unitId: { in: ids } }, select: { id: true } })
      ).map((r) => r.id);

      if (resIds.length > 0) {
        await tx.transaction.deleteMany({ where: { reservationId: { in: resIds } } });
        await tx.guest.deleteMany({ where: { reservationId: { in: resIds } } });
        await tx.reservation.deleteMany({ where: { id: { in: resIds } } });
      }
      await tx.maintenance.deleteMany({ where: { unitId: { in: ids } } });
      await tx.unit.deleteMany({ where: { id: { in: ids } } });
    });

    const remain = await prisma.unit.findMany({ orderBy: [{ unitType: "asc" }, { unitNumber: "asc" }] });
    console.log(`\nالوحدات بعد الاستعادة (${remain.length}):`);
    console.table(remain.map((u) => ({ number: u.unitNumber, type: u.unitType, status: u.status })));
  } finally {
    await prisma.$disconnect();
  }
})();
