import { NextResponse } from "next/server";
import {
  findAvailableMergedPairs,
  findAvailableUnitTypes,
} from "@/lib/booking/availability";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { maybeSweepLazy } from "@/lib/reservations/sweeper";

/**
 * Guests count at which the public `/book` page starts surfacing merged
 * pairs as a listing alongside single-room offers. Below this threshold
 * guests are likely better served by a single room, so the merged option
 * is hidden to avoid UI noise and up-sell pressure.
 */
const MERGED_PAIR_MIN_GUESTS = 3;

/**
 * GET /api/book/availability?checkIn=&checkOut=&guests=
 *
 * Public endpoint used by `/book` and `/book/results`. Returns a list of
 * `UnitType`s that (a) are marked `publiclyBookable`, (b) can sleep at
 * least `guests` people, and (c) have at least one physical unit free
 * for the requested window.
 */
export async function GET(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit({
      key: `book:availability:${ip}`,
      limit: 60,
      windowMs: 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "عدد الطلبات كبير. حاول لاحقاً." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    await maybeSweepLazy().catch(() => {});

    const { searchParams } = new URL(request.url);
    const checkInParam = searchParams.get("checkIn");
    const checkOutParam = searchParams.get("checkOut");
    const guestsParam = searchParams.get("guests") ?? "1";

    if (!checkInParam || !checkOutParam) {
      return NextResponse.json(
        { error: "الرجاء تحديد تاريخ الوصول والمغادرة" },
        { status: 400 },
      );
    }
    const checkIn = new Date(checkInParam);
    const checkOut = new Date(checkOutParam);
    if (
      Number.isNaN(checkIn.getTime()) ||
      Number.isNaN(checkOut.getTime()) ||
      checkOut <= checkIn
    ) {
      return NextResponse.json(
        { error: "نطاق التواريخ غير صالح" },
        { status: 400 },
      );
    }
    const guests = Math.max(1, parseInt(guestsParam, 10) || 1);

    const [types, mergedPairs] = await Promise.all([
      findAvailableUnitTypes({ checkIn, checkOut, guests }),
      guests >= MERGED_PAIR_MIN_GUESTS
        ? findAvailableMergedPairs({ checkIn, checkOut, guests })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      checkIn: checkIn.toISOString(),
      checkOut: checkOut.toISOString(),
      guests,
      results: types.map((t) => ({
        unitTypeId: t.unitTypeId,
        code: t.code,
        nameAr: t.nameAr,
        nameEn: t.nameEn,
        category: t.category,
        maxAdults: t.maxAdults,
        maxChildren: t.maxChildren,
        maxOccupancy: t.maxOccupancy,
        sizeSqm: t.sizeSqm,
        hasKitchen: t.hasKitchen,
        hasBalcony: t.hasBalcony,
        view: t.view,
        basePriceDaily: t.basePriceDaily,
        availableCount: t.availableCount,
        primaryPhotoUrl: t.primaryPhotoUrl,
        primaryPhotoId: t.primaryPhotoId,
      })),
      mergedPairs: mergedPairs.map((p) => ({
        mergeId: p.mergeId,
        unitANumber: p.unitANumber,
        unitBNumber: p.unitBNumber,
        unitTypeNamesAr: p.unitTypeNamesAr,
        maxOccupancy: p.maxOccupancy,
        maxAdults: p.maxAdults,
        maxChildren: p.maxChildren,
        sizeSqm: p.sizeSqm,
        hasKitchen: p.hasKitchen,
        hasBalcony: p.hasBalcony,
        basePriceDaily: p.basePriceDaily,
        primaryPhotoUrl: p.primaryPhotoUrl,
        primaryPhotoId: p.primaryPhotoId,
      })),
    });
  } catch (error) {
    console.error("GET /api/book/availability error:", error);
    return NextResponse.json(
      { error: "تعذّر جلب التوافر" },
      { status: 500 },
    );
  }
}
