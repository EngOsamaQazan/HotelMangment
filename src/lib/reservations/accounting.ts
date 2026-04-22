import type { Prisma, PrismaClient } from "@prisma/client";
import {
  postEntry,
  voidEntry,
  getOrCreateGuestParty,
  cashAccountCodeFromMethod,
  ACCOUNT_CODES,
} from "@/lib/accounting";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Reservation accounting helpers.
 *
 * Posting policy (ISO/IFRS aligned, immutable ledger):
 *   - Every reservation produces at most two posted journal entries:
 *       1) Revenue entry  (source="reservation", sourceRefId=reservationId)
 *          DR  1100 AR_GUESTS       = totalAmount
 *          CR  4010 REVENUE_ROOMS   = totalAmount
 *       2) Payment entry  (source="payment",     sourceRefId=reservationId)
 *          DR  1010/1020 CASH/BANK  = paidAmount
 *          CR  1100 AR_GUESTS       = paidAmount
 *   - Posted entries are NEVER mutated. Any change to the financial facts
 *     of the reservation (total, paid, check-in date, guest identity,…)
 *     triggers a reversal (contra) entry via `voidEntry()` followed by a
 *     fresh post with the corrected values. This preserves the audit trail
 *     that regulators (IAS 8, SOX 404) and ISO 27001 expect.
 *   - Extensions get their OWN additional entries (see `postExtensionEntries`)
 *     instead of re-issuing the original ones.
 */

export interface ReservationFinancialSnapshot {
  reservationId: number;
  guestName: string;
  guestIdNumber?: string | null;
  phone?: string | null;
  unitNumber: string;
  checkIn: Date;
  totalAmount: number;
  paidAmount: number;
  paymentMethod?: string | null;
  /**
   * Economic date the cash was actually received. Defaults to "now" for the
   * normal create flow; back-office back-dating flows pass the historical
   * date (usually equal to `checkIn`) so the cash entry posts in the correct
   * accounting period instead of today's.
   */
  paymentDate?: Date;
}

/**
 * Post the initial revenue + (optional) payment entries for a reservation.
 * Intended for the create flow and for re-posting after a reversal.
 */
export async function postReservationEntries(
  tx: Tx,
  snapshot: ReservationFinancialSnapshot,
): Promise<{ partyId: number }> {
  const {
    reservationId,
    guestName,
    guestIdNumber,
    phone,
    unitNumber,
    checkIn,
    totalAmount,
    paidAmount,
    paymentMethod,
    paymentDate,
  } = snapshot;

  const partyId = await getOrCreateGuestParty(tx, {
    name: guestName,
    phone: phone ?? null,
    nationalId: guestIdNumber ?? null,
    reservationId,
  });

  if (totalAmount > 0) {
    await postEntry(tx, {
      date: checkIn,
      description: `حجز #${reservationId} - ${guestName} - ${unitNumber}`,
      source: "reservation",
      sourceRefId: reservationId,
      lines: [
        {
          accountCode: ACCOUNT_CODES.AR_GUESTS,
          partyId,
          debit: totalAmount,
          description: `ذمة الضيف ${guestName}`,
        },
        {
          accountCode: ACCOUNT_CODES.REVENUE_ROOMS,
          credit: totalAmount,
          description: `إيراد حجز ${unitNumber}`,
        },
      ],
    });
  }

  if (paidAmount > 0) {
    const cashCode = cashAccountCodeFromMethod(paymentMethod);
    await postEntry(tx, {
      date: paymentDate ?? new Date(),
      description: `دفعة حجز #${reservationId} - ${guestName}`,
      source: "payment",
      sourceRefId: reservationId,
      lines: [
        {
          accountCode: cashCode,
          debit: paidAmount,
          description: `استلام دفعة ${guestName}`,
        },
        {
          accountCode: ACCOUNT_CODES.AR_GUESTS,
          partyId,
          credit: paidAmount,
          description: `سداد جزء من ذمة الضيف`,
        },
      ],
    });
  }

  return { partyId };
}

/**
 * Reverse every posted journal entry tied to this reservation
 * (both `reservation` and `payment` sources). Each reversal creates a
 * mirror-image contra entry and marks the original as `void` with the
 * supplied reason. Idempotent: skips entries already voided.
 */
export async function reverseReservationEntries(
  tx: Tx,
  reservationId: number,
  reason: string,
  voidedById?: number | null,
): Promise<number> {
  const entries = await tx.journalEntry.findMany({
    where: {
      OR: [
        { source: "reservation", sourceRefId: reservationId },
        { source: "payment", sourceRefId: reservationId },
        { source: "extension", sourceRefId: reservationId },
      ],
      status: "posted",
    },
    select: { id: true },
  });
  for (const e of entries) {
    await voidEntry(tx, e.id, reason, voidedById ?? null);
  }
  return entries.length;
}

/**
 * Post incremental entries for a reservation extension.
 * The original reservation entries stay untouched — accounting treats
 * the extension as a new economic event.
 */
export async function postExtensionEntries(
  tx: Tx,
  args: {
    reservationId: number;
    extensionId?: number;
    guestName: string;
    guestIdNumber?: string | null;
    phone?: string | null;
    unitNumber: string;
    addedAmount: number;
    addedPaid: number;
    paymentMethod?: string | null;
    extensionDate?: Date;
  },
): Promise<void> {
  const {
    reservationId,
    extensionId,
    guestName,
    guestIdNumber,
    phone,
    unitNumber,
    addedAmount,
    addedPaid,
    paymentMethod,
    extensionDate = new Date(),
  } = args;

  const partyId = await getOrCreateGuestParty(tx, {
    name: guestName,
    phone: phone ?? null,
    nationalId: guestIdNumber ?? null,
    reservationId,
  });

  // `reference` carries the extension id so we can later void exactly the
  // entries tied to a single extension event (see `reverseExtensionEntries`).
  const extRef = extensionId != null ? `ext:${extensionId}` : null;

  if (addedAmount > 0) {
    await postEntry(tx, {
      date: extensionDate,
      description: `تمديد حجز #${reservationId} - ${guestName} - ${unitNumber}`,
      source: "extension",
      sourceRefId: reservationId,
      reference: extRef,
      lines: [
        {
          accountCode: ACCOUNT_CODES.AR_GUESTS,
          partyId,
          debit: addedAmount,
          description: `زيادة ذمة الضيف ${guestName} - تمديد`,
        },
        {
          accountCode: ACCOUNT_CODES.REVENUE_ROOMS,
          credit: addedAmount,
          description: `إيراد تمديد حجز ${unitNumber}`,
        },
      ],
    });
  }

  if (addedPaid > 0) {
    const cashCode = cashAccountCodeFromMethod(paymentMethod);
    await postEntry(tx, {
      date: extensionDate,
      description: `دفعة تمديد حجز #${reservationId} - ${guestName}`,
      source: "payment",
      sourceRefId: reservationId,
      reference: extRef,
      lines: [
        {
          accountCode: cashCode,
          debit: addedPaid,
          description: `استلام دفعة تمديد ${guestName}`,
        },
        {
          accountCode: ACCOUNT_CODES.AR_GUESTS,
          partyId,
          credit: addedPaid,
          description: `سداد جزء من ذمة الضيف - تمديد`,
        },
      ],
    });
  }
}

/**
 * Reverse every journal entry tied to a single extension event. This is
 * called when the front-desk undoes an extension (e.g. clerical mistake).
 * Matches both the revenue (`source="extension"`) and any payment entries
 * (`source="payment"`) posted against this specific extension via the
 * `reference = "ext:<id>"` marker set by `postExtensionEntries`.
 */
export async function reverseExtensionEntries(
  tx: Tx,
  args: {
    reservationId: number;
    extensionId: number;
    reason: string;
    voidedById?: number | null;
  },
): Promise<number> {
  const { reservationId, extensionId, reason, voidedById } = args;
  const entries = await tx.journalEntry.findMany({
    where: {
      sourceRefId: reservationId,
      reference: `ext:${extensionId}`,
      status: "posted",
    },
    select: { id: true },
  });
  for (const e of entries) {
    await voidEntry(tx, e.id, reason, voidedById ?? null);
  }
  return entries.length;
}

/**
 * Detect whether a PUT payload touches fields that the ledger depends on.
 * Callers use this flag to decide whether a reversal + re-post is required.
 */
export function hasFinancialImpact(args: {
  existing: {
    guestName: string;
    guestIdNumber: string | null;
    phone: string | null;
    checkIn: Date;
    totalAmount: unknown;
    paidAmount: unknown;
    paymentMethod: string | null;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  incoming: Record<string, any>;
}): boolean {
  const { existing, incoming } = args;

  if (incoming.totalAmount !== undefined) {
    if (Number(incoming.totalAmount) !== Number(existing.totalAmount)) return true;
  }
  if (incoming.paidAmount !== undefined) {
    if (Number(incoming.paidAmount) !== Number(existing.paidAmount)) return true;
  }
  if (incoming.checkIn !== undefined) {
    const nextIso = new Date(incoming.checkIn).toISOString();
    if (nextIso !== existing.checkIn.toISOString()) return true;
  }
  if (incoming.guestName !== undefined && incoming.guestName !== existing.guestName) {
    return true;
  }
  if (incoming.guestIdNumber !== undefined && (incoming.guestIdNumber || null) !== existing.guestIdNumber) {
    return true;
  }
  if (incoming.phone !== undefined && (incoming.phone || null) !== existing.phone) {
    return true;
  }
  if (incoming.paymentMethod !== undefined && (incoming.paymentMethod || null) !== existing.paymentMethod) {
    return true;
  }
  return false;
}
