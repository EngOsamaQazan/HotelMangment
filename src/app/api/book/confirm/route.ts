import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmHold, HoldError } from "@/lib/booking/hold";
import { sendText, isWhatsAppApiError } from "@/lib/whatsapp/client";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/book/confirm
 * Body: { holdId }
 *
 * Finalizes a hold created by POST /api/book/hold and:
 *   1. Generates a `confirmationCode` the guest can reference later.
 *   2. Creates a `Notification` for every staff user with `reservations:view`.
 *   3. Sends a WhatsApp confirmation to the guest (best-effort).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.audience !== "guest") {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول كضيف" },
        { status: 401 },
      );
    }
    const guestAccountId = Number(session.user.id);
    if (!Number.isFinite(guestAccountId)) {
      return NextResponse.json({ error: "جلسة غير صالحة" }, { status: 401 });
    }

    const ip = clientIp(request);
    const rl = rateLimit({
      key: `book:confirm:ip:${ip}`,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "عدد المحاولات كبير. حاول لاحقاً." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      holdId?: number;
    };
    const holdId = Number(body.holdId);
    if (!Number.isFinite(holdId)) {
      return NextResponse.json({ error: "معرف الحجز مفقود" }, { status: 400 });
    }

    const { reservationId, confirmationCode } = await confirmHold({
      holdId,
      guestAccountId,
    });

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        unit: {
          select: {
            unitNumber: true,
            unitTypeRef: { select: { nameAr: true, nameEn: true } },
          },
        },
      },
    });

    if (reservation) {
      await notifyStaffOfNewBooking(reservation);
      await notifyGuestOfConfirmation(reservation).catch((err) => {
        console.warn("[book/confirm] guest WhatsApp failed", err);
      });
    }

    return NextResponse.json({
      ok: true,
      reservationId,
      confirmationCode,
    });
  } catch (error) {
    if (error instanceof HoldError) {
      const status =
        error.code === "race"
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
    console.error("POST /api/book/confirm error:", error);
    return NextResponse.json(
      { error: "تعذّر تأكيد الحجز" },
      { status: 500 },
    );
  }
}

async function notifyStaffOfNewBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reservation: any,
) {
  try {
    const staff = await prisma.user.findMany({
      where: {
        OR: [
          {
            userRoles: {
              some: {
                role: {
                  permissions: {
                    some: {
                      permission: { key: "reservations:view" },
                    },
                  },
                },
              },
            },
          },
          {
            permissionOverrides: {
              some: {
                effect: "allow",
                permission: { key: "reservations:view" },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (staff.length === 0) return;
    const unitName =
      reservation.unit?.unitTypeRef?.nameAr ??
      reservation.unit?.unitNumber ??
      "";
    const dateFmt = new Intl.DateTimeFormat("ar-EG", {
      day: "2-digit",
      month: "short",
    });
    const body = `${reservation.guestName} · ${unitName} · ${dateFmt.format(
      reservation.checkIn,
    )} → ${dateFmt.format(reservation.checkOut)}`;
    await prisma.notification.createMany({
      data: staff.map((u) => ({
        userId: u.id,
        type: "reservation.direct_web",
        title: "حجز مباشر جديد عبر الموقع",
        body,
        linkUrl: `/reservations/${reservation.id}`,
        payloadJson: {
          reservationId: reservation.id,
          confirmationCode: reservation.confirmationCode,
        },
      })),
    });
  } catch (err) {
    console.warn("[book/confirm] staff notification failed", err);
  }
}

async function notifyGuestOfConfirmation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reservation: any,
) {
  const to = reservation.phone;
  if (!to) return;
  const template = process.env.WHATSAPP_BOOKING_CONFIRM_TEMPLATE;
  const unitName =
    reservation.unit?.unitTypeRef?.nameAr ?? reservation.unit?.unitNumber ?? "";
  const dateFmt = new Intl.DateTimeFormat("ar-EG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const message =
    `تم تأكيد حجزك في فندق المفرق.\n` +
    `رمز الحجز: ${reservation.confirmationCode}\n` +
    `${unitName} · ${reservation.numNights} ليلة\n` +
    `${dateFmt.format(reservation.checkIn)} → ${dateFmt.format(reservation.checkOut)}\n` +
    `المجموع: ${reservation.totalAmount} د.أ\n\n` +
    `يمكنك عرض قسيمة الحجز من حسابك على الموقع.`;

  try {
    if (template) {
      // If a template is configured we keep the text fallback to avoid
      // coupling the integration to a specific component layout.
      await sendText({ to, text: message });
    } else {
      await sendText({ to, text: message });
    }
  } catch (err) {
    if (isWhatsAppApiError(err)) {
      console.warn("[book/confirm] WhatsApp API error", err.code, err.message);
    } else {
      throw err;
    }
  }
}
