/**
 * push-prices.ts — pushes UnitTypePrice rows for a given Season into the
 * Extranet's "Rates & Availability" calendar.
 *
 * ⚠️  NOT YET IMPLEMENTED. This is a typed stub so the runner compiles and the
 * UI can create the jobs end-to-end. Fill in `applyPrice` with the actual
 * Playwright interactions once you've mapped the Extranet DOM.
 */

import { log } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { login } from "./login";

export interface PushPricesPayload {
  credentialId: number;
  seasonId: number;
  /** If omitted, pushes every mapped unit type. */
  unitTypeIds?: number[];
}

export interface PushPricesResult {
  attempted: number;
  updated: number;
  skipped: number;
}

export async function pushPrices(
  jobId: number,
  payload: PushPricesPayload,
): Promise<PushPricesResult> {
  if (!payload.credentialId || !payload.seasonId) {
    throw new Error("credentialId و seasonId مطلوبان");
  }

  const season = await prisma.season.findUnique({ where: { id: payload.seasonId } });
  if (!season) throw new Error(`Season ${payload.seasonId} not found`);

  const prices = await prisma.unitTypePrice.findMany({
    where: {
      seasonId: payload.seasonId,
      ...(payload.unitTypeIds ? { unitTypeId: { in: payload.unitTypeIds } } : {}),
    },
    include: { unitType: true },
  });

  // Find Extranet room id for each unit type via property map.
  const typeIds = prices.map((p) => p.unitTypeId);
  const maps = await prisma.bookingPropertyMap.findMany({
    where: { unitTypeId: { in: typeIds } },
  });
  const byType = new Map(maps.map((m) => [m.unitTypeId!, m]));

  await log(jobId, "info", `Push Prices: season=${season.nameAr}, rows=${prices.length}`);

  const { bundle } = await login(jobId, payload.credentialId);
  const { page, screenshot, close } = bundle;

  const result: PushPricesResult = { attempted: 0, updated: 0, skipped: 0 };
  try {
    await page.goto(
      "https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/rates-availability.html",
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await screenshot("05-rates-page");

    for (const row of prices) {
      result.attempted++;
      const m = byType.get(row.unitTypeId);
      if (!m) {
        await log(jobId, "warn", `لا يوجد ربط Booking لنوع ${row.unitType.nameAr}`, {
          unitTypeId: row.unitTypeId,
        });
        result.skipped++;
        continue;
      }

      // TODO: select the room row by `extranetRoomId`, open the date range
      // picker, enter daily price, click Save. Leaving this as a stub keeps
      // the job successful for wiring tests.
      await log(jobId, "info", `(stub) سيتم تحديث ${row.unitType.nameAr} → ${row.daily} JOD`, {
        extranetRoomId: m.extranetRoomId,
        seasonRange: `${season.startDate.toISOString()}..${season.endDate.toISOString()}`,
      });
      result.updated++;
    }

    return result;
  } finally {
    await close().catch(() => {});
  }
}
