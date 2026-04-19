/* يختبر الاتصال بقاعدة البيانات عبر Prisma (يُستدعى من setup-local-prod-database.ps1) */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("OK");
  } catch (e) {
    console.error(e.message || String(e));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
