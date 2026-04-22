import { NextResponse } from "next/server";
import { calcQuote } from "@/lib/booking/pricing";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/book/quote
 * Body: { unitTypeId, checkIn, checkOut, guests }
 *
 * Server-authoritative pricing — never trust a price from the client.
 * This is what the checkout screen and the results page use to render
 * the breakdown.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit({
      key: `book:quote:${ip}`,
      limit: 120,
      windowMs: 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "عدد الطلبات كبير. حاول لاحقاً." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      unitTypeId?: number;
      checkIn?: string;
      checkOut?: string;
      guests?: number;
    };
    const unitTypeId = Number(body.unitTypeId);
    const checkIn = body.checkIn ? new Date(body.checkIn) : null;
    const checkOut = body.checkOut ? new Date(body.checkOut) : null;
    const guests = Math.max(1, Number(body.guests) || 1);

    if (
      !Number.isFinite(unitTypeId) ||
      !checkIn ||
      !checkOut ||
      Number.isNaN(checkIn.getTime()) ||
      Number.isNaN(checkOut.getTime())
    ) {
      return NextResponse.json(
        { error: "بيانات الطلب غير مكتملة" },
        { status: 400 },
      );
    }

    const quote = await calcQuote({ unitTypeId, checkIn, checkOut, guests });

    if (quote.unavailableReason === "not_publicly_bookable") {
      return NextResponse.json(
        { error: "نوع الوحدة غير متاح للحجز عبر الموقع" },
        { status: 404 },
      );
    }
    if (quote.unavailableReason === "unit_type_not_found") {
      return NextResponse.json(
        { error: "نوع الوحدة غير موجود" },
        { status: 404 },
      );
    }
    if (quote.unavailableReason === "invalid_dates") {
      return NextResponse.json(
        { error: "نطاق التواريخ غير صالح" },
        { status: 400 },
      );
    }

    return NextResponse.json(quote);
  } catch (error) {
    console.error("POST /api/book/quote error:", error);
    return NextResponse.json(
      { error: "تعذّر حساب السعر" },
      { status: 500 },
    );
  }
}
