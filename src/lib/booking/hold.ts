import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { calcQuote, type Quote } from "./pricing";
import { findAvailableUnitTypes, isUnitFree } from "./availability";

/**
 * 15-minute "holds" let a guest fill in their checkout details without
 * losing their room to another booker. The row is a full `Reservation` with
 * `status = "pending_hold"` and a non-null `holdExpiresAt`. Expired holds
 * are swept lazily by `maybeSweepLazy()` in the existing reservations
 * module — we don't need our own cron.
 *
 * The confirmation step flips the status to `upcoming` (or `active` if
 * check-in is today) and assigns a short, human-typable `confirmationCode`.
 */

export const HOLD_TTL_MINUTES = 15;

export interface CreateHoldInput {
  unitTypeId: number;
  checkIn: Date;
  checkOut: Date;
  guests: number;
  guestAccountId: number;
  guestName: string;
  phone: string;
  nationality?: string | null;
  idNumber?: string | null;
  notes?: string | null;
  bedSetupRequested?: string | null;
}

export interface CreateHoldResult {
  holdId: number;
  expiresAt: Date;
  quote: Quote;
  unitId: number;
}

export async function createHold(
  input: CreateHoldInput,
): Promise<CreateHoldResult> {
  const quote = await calcQuote({
    unitTypeId: input.unitTypeId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
  });
  if (quote.unavailableReason) {
    throw new HoldError(
      quote.unavailableReason === "not_publicly_bookable"
        ? "نوع الوحدة غير متاح للحجز المباشر"
        : quote.unavailableReason === "invalid_dates"
          ? "نطاق التواريخ غير صالح"
          : "نوع الوحدة غير متاح",
      "unavailable",
    );
  }

  const available = await findAvailableUnitTypes({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
  });
  const match = available.find((a) => a.unitTypeId === input.unitTypeId);
  if (!match || !match.firstAvailableUnitId) {
    throw new HoldError(
      "لا توجد وحدات متاحة لهذا النوع ضمن التواريخ المطلوبة",
      "unavailable",
    );
  }

  const expiresAt = new Date(
    Date.now() + HOLD_TTL_MINUTES * 60 * 1000,
  );

  const pricePerNight = quote.nights
    ? round2(quote.total / quote.nights)
    : 0;

  const hold = await prisma.reservation.create({
    data: {
      unitId: match.firstAvailableUnitId,
      guestName: input.guestName,
      phone: input.phone,
      nationality: input.nationality ?? null,
      guestIdNumber: input.idNumber ?? null,
      numGuests: Math.max(1, input.guests),
      numNights: quote.nights,
      stayType: "daily",
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      unitPrice: pricePerNight,
      totalAmount: round2(quote.total),
      paidAmount: 0,
      remaining: round2(quote.total),
      status: "pending_hold",
      source: "direct_web",
      holdExpiresAt: expiresAt,
      guestAccountId: input.guestAccountId,
      notes: input.notes ?? null,
      bedSetupRequested: input.bedSetupRequested ?? null,
    },
    select: { id: true },
  });

  return {
    holdId: hold.id,
    expiresAt,
    quote,
    unitId: match.firstAvailableUnitId,
  };
}

/**
 * Flip a hold into a confirmed reservation. Re-validates that the hold
 * still exists, belongs to the given guest and is not expired. Returns
 * the short `confirmationCode` that the guest can use on the confirmation
 * screen and in their account portal.
 */
export async function confirmHold(args: {
  holdId: number;
  guestAccountId: number;
}): Promise<{ reservationId: number; confirmationCode: string }> {
  const { holdId, guestAccountId } = args;

  return prisma.$transaction(async (tx) => {
    const hold = await tx.reservation.findUnique({
      where: { id: holdId },
      select: {
        id: true,
        status: true,
        holdExpiresAt: true,
        guestAccountId: true,
        unitId: true,
        checkIn: true,
        checkOut: true,
        confirmationCode: true,
      },
    });
    if (!hold) throw new HoldError("الحجز المؤقّت غير موجود", "not_found");
    if (hold.guestAccountId !== guestAccountId) {
      throw new HoldError("لا يمكنك تأكيد حجز يخصّ حساباً آخر", "forbidden");
    }
    if (hold.status !== "pending_hold") {
      // Idempotent: if already confirmed, return its code.
      if (hold.confirmationCode) {
        return {
          reservationId: hold.id,
          confirmationCode: hold.confirmationCode,
        };
      }
      throw new HoldError("هذا الحجز لم يعد مؤقّتاً", "bad_state");
    }
    if (!hold.holdExpiresAt || hold.holdExpiresAt <= new Date()) {
      throw new HoldError(
        "انتهت صلاحية الحجز المؤقّت. يرجى البدء من جديد.",
        "expired",
      );
    }

    // Double-check the unit is still free against any racing confirms.
    const stillFree = await isUnitFree({
      unitId: hold.unitId,
      checkIn: hold.checkIn,
      checkOut: hold.checkOut,
    });
    // isUnitFree counts this very row as a conflict (pending_hold), so we
    // deliberately exclude it by re-querying excluding our id.
    const otherConflict = await tx.reservation.findFirst({
      where: {
        unitId: hold.unitId,
        id: { not: hold.id },
        OR: [
          { status: { in: ["active", "upcoming"] } },
          {
            status: "pending_hold",
            holdExpiresAt: { gt: new Date() },
          },
        ],
        checkIn: { lt: hold.checkOut },
        checkOut: { gt: hold.checkIn },
      },
      select: { id: true },
    });
    if (!stillFree && otherConflict) {
      throw new HoldError(
        "تمّ حجز هذه الوحدة للتواريخ نفسها. يرجى اختيار وحدة أخرى.",
        "race",
      );
    }

    const now = new Date();
    const startsToday =
      hold.checkIn.getUTCFullYear() === now.getUTCFullYear() &&
      hold.checkIn.getUTCMonth() === now.getUTCMonth() &&
      hold.checkIn.getUTCDate() === now.getUTCDate();
    const nextStatus = startsToday ? "active" : "upcoming";

    const code = await generateConfirmationCode(tx);

    await tx.reservation.update({
      where: { id: hold.id },
      data: {
        status: nextStatus,
        holdExpiresAt: null,
        confirmationCode: code,
      },
    });

    return { reservationId: hold.id, confirmationCode: code };
  });
}

export class HoldError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "unavailable"
      | "expired"
      | "forbidden"
      | "not_found"
      | "bad_state"
      | "race",
  ) {
    super(message);
    this.name = "HoldError";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1

function randomCode(): string {
  const bytes = crypto.randomBytes(6);
  let s = "FKH-";
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return s;
}

async function generateConfirmationCode(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const clash = await tx.reservation.findUnique({
      where: { confirmationCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  throw new HoldError("تعذّر توليد رمز تأكيد فريد", "bad_state");
}
