import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Server-authoritative pricing for direct bookings.
 *
 * We NEVER trust a price coming from the client. Given a unit-type and a
 * date window, we compute the nightly breakdown, subtotal and total from
 * the database — resolved per night so that stays crossing seasons are
 * priced correctly.
 *
 * Lookup order for each night's rate (descending priority):
 *   1. `UnitTypePrice.daily` for a Season whose [startDate, endDate] covers
 *      the night AND that matches the unitType. Multiple matching seasons
 *      → pick the one with the latest `startDate` (most specific).
 *   2. `SeasonalPrice` (legacy, by category): use `roomDaily` for
 *      hotel_room/suite/studio, `aptDaily` for apartment.
 *   3. `UnitType.basePriceDaily` fallback.
 *
 * Taxes: currently 0 — Jordan hotel tax handling lives in the accounting
 * layer and is applied at checkout time. This function reports a flat
 * `taxes: 0` but the API contract keeps the field in case we add it.
 */

export interface QuoteNight {
  date: string; // YYYY-MM-DD
  rate: number; // JOD
  source: "unit_type_price" | "seasonal_price" | "base";
  seasonName?: string;
}

export interface QuoteInput {
  unitTypeId: number;
  checkIn: Date;
  checkOut: Date;
  guests: number;
}

export interface Quote {
  unitTypeId: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  currency: "JOD";
  nightsBreakdown: QuoteNight[];
  subtotal: number;
  taxes: number;
  total: number;
  /** If `null` the unit type is bookable for the requested window. */
  unavailableReason:
    | null
    | "not_publicly_bookable"
    | "unit_type_not_found"
    | "invalid_dates"
    | "no_units";
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Returns the number of calendar nights between `from` (inclusive) and `to` (exclusive). */
export function countNights(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

export async function calcQuote(input: QuoteInput): Promise<Quote> {
  const { unitTypeId, checkIn, checkOut, guests } = input;

  const base: Omit<Quote, "unavailableReason"> & { unavailableReason: Quote["unavailableReason"] } = {
    unitTypeId,
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    nights: 0,
    guests,
    currency: "JOD",
    nightsBreakdown: [],
    subtotal: 0,
    taxes: 0,
    total: 0,
    unavailableReason: null,
  };

  if (checkOut <= checkIn) {
    return { ...base, unavailableReason: "invalid_dates" };
  }

  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    select: {
      id: true,
      category: true,
      isActive: true,
      publiclyBookable: true,
      basePriceDaily: true,
    },
  });
  if (!unitType || !unitType.isActive) {
    return { ...base, unavailableReason: "unit_type_not_found" };
  }
  if (!unitType.publiclyBookable) {
    return { ...base, unavailableReason: "not_publicly_bookable" };
  }

  const nights = countNights(checkIn, checkOut);
  if (nights <= 0) return { ...base, unavailableReason: "invalid_dates" };

  const typePrices = await prisma.unitTypePrice.findMany({
    where: {
      unitTypeId,
      season: {
        startDate: { lte: checkOut },
        endDate: { gt: checkIn },
        isActive: true,
      },
    },
    include: {
      season: {
        select: { id: true, nameAr: true, startDate: true, endDate: true },
      },
    },
  });

  const legacy = await prisma.seasonalPrice.findMany({
    where: {
      startDate: { lte: checkOut },
      endDate: { gt: checkIn },
    },
    orderBy: { startDate: "desc" },
  });

  const categoryKey: "room" | "apt" =
    unitType.category === "apartment" ? "apt" : "room";

  const breakdown: QuoteNight[] = [];
  for (let i = 0; i < nights; i++) {
    const nightStart = addDays(checkIn, i);

    const fromType = typePrices
      .filter(
        (p) =>
          p.season.startDate <= nightStart &&
          p.season.endDate > nightStart &&
          p.daily > 0,
      )
      .sort(
        (a, b) => b.season.startDate.getTime() - a.season.startDate.getTime(),
      )[0];

    if (fromType) {
      breakdown.push({
        date: ymd(nightStart),
        rate: fromType.daily,
        source: "unit_type_price",
        seasonName: fromType.season.nameAr,
      });
      continue;
    }

    const fromLegacy = legacy.find(
      (s) => s.startDate <= nightStart && s.endDate > nightStart,
    );
    if (fromLegacy) {
      const rate = categoryKey === "apt" ? fromLegacy.aptDaily : fromLegacy.roomDaily;
      if (rate > 0) {
        breakdown.push({
          date: ymd(nightStart),
          rate,
          source: "seasonal_price",
          seasonName: fromLegacy.seasonName,
        });
        continue;
      }
    }

    const baseRate = unitType.basePriceDaily ?? 0;
    breakdown.push({
      date: ymd(nightStart),
      rate: baseRate,
      source: "base",
    });
  }

  const subtotal = breakdown.reduce((s, n) => s + n.rate, 0);
  const taxes = 0;
  const total = subtotal + taxes;

  return {
    ...base,
    nights,
    nightsBreakdown: breakdown,
    subtotal: round2(subtotal),
    taxes,
    total: round2(total),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
