/**
 * Migrate legacy SeasonalPrice rows into the new Season + UnitTypePrice model.
 *
 * Strategy:
 *   - Each SeasonalPrice row becomes a Season row (same name/dates).
 *   - For every UnitType: copy the legacy `room_*` prices if category in
 *     [hotel_room, suite, studio], and `apt_*` prices if category = apartment.
 *   - Idempotent: re-running updates existing UnitTypePrice rows; never duplicates.
 *
 * Usage:
 *   npm run db:migrate-prices
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("💰 ترحيل الأسعار الموسمية إلى نموذج UnitTypePrice...");

  const legacy = await prisma.seasonalPrice.findMany({ orderBy: { startDate: "asc" } });
  if (legacy.length === 0) {
    console.log("   لا توجد أسعار قديمة للترحيل.");
    return;
  }

  const types = await prisma.unitType.findMany({
    select: { id: true, code: true, category: true },
  });
  if (types.length === 0) {
    console.log("   ⚠️  لا توجد أنواع وحدات. شغّل db:seed-unit-types أولًا.");
    return;
  }

  let createdSeasons = 0;
  let updatedSeasons = 0;
  let upsertedPrices = 0;

  for (const [idx, sp] of legacy.entries()) {
    // Find or create season by unique-ish key (name + startDate).
    const existingSeason = await prisma.season.findFirst({
      where: {
        nameAr: sp.seasonName,
        startDate: sp.startDate,
      },
    });

    const season = existingSeason
      ? await prisma.season.update({
          where: { id: existingSeason.id },
          data: {
            nameAr: sp.seasonName,
            startDate: sp.startDate,
            endDate: sp.endDate,
            sortOrder: idx,
          },
        })
      : await prisma.season.create({
          data: {
            nameAr: sp.seasonName,
            startDate: sp.startDate,
            endDate: sp.endDate,
            sortOrder: idx,
          },
        });

    if (existingSeason) updatedSeasons++;
    else createdSeasons++;

    // Backfill legacy seasonal_prices.season_id for future queries.
    if (sp.seasonId !== season.id) {
      await prisma.seasonalPrice.update({
        where: { id: sp.id },
        data: { seasonId: season.id },
      });
    }

    for (const t of types) {
      const isApartment = t.category === "apartment";
      const daily = isApartment ? sp.aptDaily : sp.roomDaily;
      const weekly = isApartment ? sp.aptWeekly : sp.roomWeekly;
      const monthly = isApartment ? sp.aptMonthly : sp.roomMonthly;

      await prisma.unitTypePrice.upsert({
        where: { unitTypeId_seasonId: { unitTypeId: t.id, seasonId: season.id } },
        update: { daily, weekly, monthly },
        create: {
          unitTypeId: t.id,
          seasonId: season.id,
          daily,
          weekly,
          monthly,
        },
      });
      upsertedPrices++;
    }
  }

  console.log(`   ✓ مواسم جديدة: ${createdSeasons} · محدّثة: ${updatedSeasons}`);
  console.log(`   ✓ أسعار مرحّلة (UnitTypePrice): ${upsertedPrices}`);
}

main()
  .then(async () => {
    console.log("\n✅ انتهى الترحيل بنجاح.");
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("❌ فشل الترحيل:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
