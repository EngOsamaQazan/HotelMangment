/**
 * Idempotent post-deploy seeder for the WhatsApp bot subsystem.
 *
 * Runs from the production deploy script after `prisma db push` (which
 * creates the new bot tables) and before service restart. Intentionally
 * NEVER overrides operator-managed knobs (mode, persona, allowlist) once
 * they exist — only fills the very first install with safe defaults so
 * the bot panel doesn't crash on a fresh DB.
 *
 * Default posture: `bot_mode = "off"`. The operator must explicitly opt
 * in via /settings/whatsapp/bot before the bot answers any guest.
 *
 * Why we do this from CI rather than a one-shot SQL: the bot ships with
 * a default season + price grid for the chatbot demo; without rates the
 * `getQuote` tool would return 0 JOD and crash the natural-language
 * flow. Seeding here keeps the demo workable on any new environment
 * without DBA involvement.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SEASON_NAME_AR = "موسم افتراضي 2026 (تجريبي)";
const SEASON_NAME_EN = "Default 2026 Season (test)";

// Conservative starter prices in JOD/night. Operators override these in
// `/settings/seasons` whenever they have real seasonal data — we only
// seed when the table is completely empty.
const STARTER_PRICES: Record<number, number> = {
  1: 50,  // 1-bedroom apt — double bed
  2: 50,  // 1-bedroom apt — twin
  3: 90,  // 2-bedroom + lounge — double + triple
  4: 80,  // 2-bedroom + lounge — double + twin
  5: 70,  // hotel suite
  6: 45,  // king double room
  7: 40,  // twin single room
  8: 55,  // triple single room
  9: 65,  // quad single room
};

async function main(): Promise<void> {
  console.log("[seed-bot-defaults] starting");

  // ── 1. Ensure WhatsAppConfig singleton exists with bot defaults ─────
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg) {
    console.log("    no WhatsAppConfig row — Phase 0 seeder owns this");
  } else if (cfg.botPersonaName === null) {
    // Brand-new bot columns just got created by `prisma db push` and the
    // existing row was created before those columns existed. Backfill
    // the @default values explicitly so the settings UI never sees null.
    await prisma.whatsAppConfig.update({
      where: { id: 1 },
      data: {
        botMode: cfg.botMode ?? "off",
        botPersonaName: "محمد",
        botPersonaTone: "warm",
        botLlmProvider: "openai",
        botLlmModel: "gpt-4o-mini",
        botMaxToolHops: 5,
        botMaxTurns: 12,
        botDailyBudgetUsd: 5,
        botCostTodayUsd: 0,
        botCircuitBreakerEnabled: true,
        botHumanlikePacing: true,
        botPaymentCurrency: "JOD",
      },
    });
    console.log("    backfilled bot defaults on existing WhatsAppConfig");
  } else {
    console.log("    WhatsAppConfig already has bot defaults — skipping");
  }

  // ── 2. Seed a starter season + per-type prices, ONLY if the rate
  //       grid is completely empty. We never overwrite existing prices.
  const haveSeasons = await prisma.season.count();
  const haveTypePrices = await prisma.unitTypePrice.count();
  const haveLegacyPrices = await prisma.seasonalPrice.count();
  if (haveSeasons === 0 && haveTypePrices === 0 && haveLegacyPrices === 0) {
    const season = await prisma.season.create({
      data: {
        nameAr: SEASON_NAME_AR,
        nameEn: SEASON_NAME_EN,
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2027-12-31T00:00:00Z"),
        isActive: true,
        sortOrder: 1,
      },
    });
    console.log(`    created starter season #${season.id}`);

    const existingTypes = await prisma.unitType.findMany({
      select: { id: true },
    });
    const knownIds = new Set(existingTypes.map((t) => t.id));
    let priced = 0;
    for (const [idStr, daily] of Object.entries(STARTER_PRICES)) {
      const unitTypeId = Number(idStr);
      if (!knownIds.has(unitTypeId)) continue;
      await prisma.unitTypePrice.create({
        data: {
          unitTypeId,
          seasonId: season.id,
          daily,
          weekly: Math.round(daily * 7 * 0.93),
          monthly: Math.round(daily * 30 * 0.85),
        },
      });
      priced++;
    }
    console.log(`    seeded ${priced} starter prices`);
  } else {
    console.log(
      `    pricing already configured (seasons=${haveSeasons}, ` +
        `unitTypePrices=${haveTypePrices}, legacy=${haveLegacyPrices}) — skipping`,
    );
  }

  console.log("[seed-bot-defaults] done");
}

main()
  .catch((e) => {
    console.error("[seed-bot-defaults] failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
