import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHold, HoldError } from "@/lib/booking/hold";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/phone";

/**
 * POST /api/book/hold — creates a 15-minute reservation hold.
 * Body: { unitTypeId, checkIn, checkOut, guests, notes?, bedSetupRequested? }
 * Guest session required (middleware already enforces this; we re-check here).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.audience !== "guest") {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول كضيف قبل إتمام الحجز" },
        { status: 401 },
      );
    }
    const guestAccountId = Number(session.user.id);
    if (!Number.isFinite(guestAccountId)) {
      return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
    }

    const ip = clientIp(request);
    const rl = rateLimit({
      key: `book:hold:guest:${guestAccountId}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "عدد المحاولات كبير. حاول لاحقاً." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }
    const rlIp = rateLimit({
      key: `book:hold:ip:${ip}`,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    if (!rlIp.ok) {
      return NextResponse.json(
        { error: "عدد المحاولات كبير. حاول لاحقاً." },
        { status: 429, headers: { "Retry-After": String(rlIp.retryAfter) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      unitTypeId?: number;
      checkIn?: string;
      checkOut?: string;
      guests?: number;
      notes?: string | null;
      bedSetupRequested?: string | null;
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
      Number.isNaN(checkOut.getTime()) ||
      checkOut <= checkIn
    ) {
      return NextResponse.json(
        { error: "بيانات الطلب غير مكتملة" },
        { status: 400 },
      );
    }

    const guest = await prisma.guestAccount.findUnique({
      where: { id: guestAccountId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        nationality: true,
        idNumber: true,
        disabledAt: true,
      },
    });
    if (!guest || guest.disabledAt) {
      return NextResponse.json({ error: "الحساب غير متاح" }, { status: 403 });
    }

    const hold = await createHold({
      unitTypeId,
      checkIn,
      checkOut,
      guests,
      guestAccountId: guest.id,
      guestName: guest.fullName,
      phone: normalizePhone(guest.phone) ?? guest.phone,
      nationality: guest.nationality,
      idNumber: guest.idNumber,
      notes: body.notes ?? null,
      bedSetupRequested: body.bedSetupRequested ?? null,
    });

    return NextResponse.json({
      ok: true,
      holdId: hold.holdId,
      expiresAt: hold.expiresAt.toISOString(),
      quote: hold.quote,
    });
  } catch (error) {
    if (error instanceof HoldError) {
      const status =
        error.code === "unavailable"
          ? 409
          : error.code === "expired"
            ? 410
            : error.code === "forbidden"
              ? 403
              : error.code === "not_found"
                ? 404
                : 400;
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status },
      );
    }
    console.error("POST /api/book/hold error:", error);
    return NextResponse.json(
      { error: "تعذّر إنشاء الحجز المؤقّت" },
      { status: 500 },
    );
  }
}
