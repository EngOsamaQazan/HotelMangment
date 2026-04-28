import "server-only";
import { prisma } from "@/lib/prisma";
import {
  err,
  ok,
  type ToolContext,
  type ToolJsonSchema,
  type ToolResult,
} from "./types";

/**
 * "Where's my booking?" — find a reservation either by the human-typable
 * confirmation code (e.g. "FKH-AB12CD") or by the contact phone we already
 * know. We never expose another guest's PII: when looking up by phone we
 * scope to reservations whose stored phone ends with the same 9 digits as
 * the messaging contact (mirrors `findReservationIdByPhone` heuristics).
 */

export interface LookupReservationInput {
  /** Either the typed code OR omit to use the contact phone. */
  confirmationCode?: string;
}

export interface LookupReservationOutput {
  found: boolean;
  reservation: {
    id: number;
    confirmationCode: string | null;
    status: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    guestName: string;
    unitNumber: string | null;
    total: number;
    paid: number;
    remaining: number;
  } | null;
}

export async function lookupReservation(
  input: LookupReservationInput,
  ctx: ToolContext,
): Promise<ToolResult<LookupReservationOutput>> {
  let reservation;

  if (input.confirmationCode?.trim()) {
    reservation = await prisma.reservation.findFirst({
      where: { confirmationCode: input.confirmationCode.trim() },
      orderBy: { createdAt: "desc" },
      include: { unit: { select: { unitNumber: true } } },
    });
  } else {
    const tail = ctx.contactPhone.slice(-9);
    if (!tail) {
      return err({
        code: "bad_input",
        message: "Provide a confirmation code or message from a known number.",
      });
    }
    reservation = await prisma.reservation.findFirst({
      where: {
        phone: { contains: tail },
        status: { in: ["upcoming", "active", "completed"] },
      },
      orderBy: { createdAt: "desc" },
      include: { unit: { select: { unitNumber: true } } },
    });
  }

  if (!reservation) return ok({ found: false, reservation: null });

  // Privacy gate when looking up by typed code from a different phone — we
  // do NOT confirm or deny existence, we just say "no match".
  if (
    input.confirmationCode &&
    ctx.guestAccount &&
    reservation.guestAccountId &&
    reservation.guestAccountId !== ctx.guestAccount.id
  ) {
    return ok({ found: false, reservation: null });
  }

  return ok({
    found: true,
    reservation: {
      id: reservation.id,
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      checkIn: reservation.checkIn.toISOString().slice(0, 10),
      checkOut: reservation.checkOut.toISOString().slice(0, 10),
      nights: reservation.numNights,
      guestName: reservation.guestName,
      unitNumber: reservation.unit?.unitNumber ?? null,
      total: Number(reservation.totalAmount),
      paid: Number(reservation.paidAmount),
      remaining: Number(reservation.remaining),
    },
  });
}

export const lookupReservationSchema: ToolJsonSchema = {
  name: "lookupReservation",
  description:
    "Find a reservation by confirmation code (e.g. 'FKH-AB12CD') or — if omitted — by the contact phone of the current conversation. Use whenever the guest asks about an existing booking ('وين حجزي', 'بدي اعدل', 'كم باقي').",
  parameters: {
    type: "object",
    properties: {
      confirmationCode: {
        type: "string",
        description: "The 6-character code printed on the voucher; omit to look up by phone.",
      },
    },
    required: [],
    additionalProperties: false,
  },
};
