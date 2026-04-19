require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();
  try {
    const host =
      await prisma.$queryRaw`SELECT inet_server_addr()::text AS addr, current_database() AS db, current_user AS usr, version() AS ver`;
    console.log("الخادم الذي اتصلت به:");
    console.table(host);

    const counts = {
      reservations: await prisma.reservation.count(),
      guests: await prisma.guest.count(),
      transactions: await prisma.transaction.count(),
      maintenance: await prisma.maintenance.count(),
      seasonalPrices: await prisma.seasonalPrice.count(),
      units: await prisma.unit.count(),
      users: await prisma.user.count(),
    };
    console.log("الأعداد الحالية في قاعدة البيانات السحابية:");
    console.table(counts);
  } finally {
    await prisma.$disconnect();
  }
})();
