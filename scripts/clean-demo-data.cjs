/**
 * ينظّف قاعدة البيانات من جميع البيانات التجريبية، مع الإبقاء على تعريف
 * الغرف/الشقق، وإبقاء مستخدمي تسجيل الدخول حتى لا ينقفل النظام.
 *
 * الاستخدام:
 *   node scripts/clean-demo-data.cjs           # تنفيذ فعلي
 *   node scripts/clean-demo-data.cjs --dry-run # إحصاء فقط بدون حذف
 */

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { PrismaClient } = require("@prisma/client");

async function main() {
  const dry = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();
  try {
    const before = {
      reservations: await prisma.reservation.count(),
      guests: await prisma.guest.count(),
      transactions: await prisma.transaction.count(),
      maintenance: await prisma.maintenance.count(),
      seasonalPrices: await prisma.seasonalPrice.count(),
      units: await prisma.unit.count(),
      users: await prisma.user.count(),
    };

    console.log("الحالة قبل التنظيف:");
    console.table(before);

    if (dry) {
      console.log("(--dry-run: لا حذف)");
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({});
      await tx.maintenance.deleteMany({});
      await tx.guest.deleteMany({});
      await tx.reservation.deleteMany({});
      await tx.seasonalPrice.deleteMany({});
    });

    await prisma.unit.updateMany({
      data: { status: "available" },
    });

    const after = {
      reservations: await prisma.reservation.count(),
      guests: await prisma.guest.count(),
      transactions: await prisma.transaction.count(),
      maintenance: await prisma.maintenance.count(),
      seasonalPrices: await prisma.seasonalPrice.count(),
      units: await prisma.unit.count(),
      users: await prisma.user.count(),
    };

    console.log("\nالحالة بعد التنظيف:");
    console.table(after);

    console.log(
      "\nتم الحذف: الحجوزات، الضيوف، الحركات المالية، الصيانة، الأسعار الموسمية.",
    );
    console.log(
      "تم الإبقاء: تعريف الغرف/الشقق (" +
        after.units +
        " وحدة)، حسابات تسجيل الدخول (" +
        after.users +
        " مستخدم).",
    );
    console.log("جميع الوحدات أصبحت الحالة: متاح.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
