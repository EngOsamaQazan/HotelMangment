import "server-only";
import type { Prisma } from "@prisma/client";
import { postEntry, ACCOUNT_CODES } from "@/lib/accounting";

type Tx = Prisma.TransactionClient;

interface CompleteMaintenanceResult {
  id: number;
  unitId: number;
  status: string;
  cost: number;
  completionDate: Date | null;
  /** The previous status, useful to detect a real transition. */
  previousStatus: string;
}

/**
 * Completes a maintenance record inside a transaction:
 * - Updates its status/completionDate.
 * - Frees the unit (or keeps it occupied if there's an active reservation)
 *   when no other pending maintenance remains for that unit.
 * - Posts the expense journal entry + cash transaction (idempotent).
 *
 * Safe to call multiple times: if the record is already completed and the
 * journal entry is already posted, the posting step is skipped.
 *
 * Does NOT sync the linked Task — the caller is responsible for that to
 * avoid recursive loops when the trigger originates from the task side.
 */
export async function completeMaintenanceInTx(
  tx: Tx,
  maintenanceId: number,
  opts: { completionDate?: Date } = {},
): Promise<CompleteMaintenanceResult> {
  const existing = await tx.maintenance.findUnique({
    where: { id: maintenanceId },
  });
  if (!existing) {
    throw new Error(`Maintenance ${maintenanceId} not found`);
  }

  const completionDate = opts.completionDate ?? new Date();
  const previousStatus = existing.status;

  const updated = await tx.maintenance.update({
    where: { id: maintenanceId },
    data: {
      status: "completed",
      completionDate: existing.completionDate ?? completionDate,
    },
    include: { unit: true },
  });

  // Free the unit if no other pending maintenance remains.
  const pendingCount = await tx.maintenance.count({
    where: {
      unitId: updated.unitId,
      status: { not: "completed" },
      id: { not: maintenanceId },
    },
  });

  if (pendingCount === 0) {
    const activeReservations = await tx.reservation.count({
      where: { unitId: updated.unitId, status: "active" },
    });
    await tx.unit.update({
      where: { id: updated.unitId },
      data: { status: activeReservations > 0 ? "occupied" : "available" },
    });
  }

  // Post the expense entry (idempotent — skip if already posted).
  const costNum = Number(updated.cost);
  if (costNum > 0 && previousStatus !== "completed") {
    const alreadyPosted = await tx.journalEntry.findFirst({
      where: {
        source: "maintenance",
        sourceRefId: updated.id,
        status: "posted",
      },
    });
    if (!alreadyPosted) {
      await postEntry(tx, {
        date: updated.completionDate ?? completionDate,
        description: `صيانة ${updated.unit.unitNumber} - ${updated.description}`,
        source: "maintenance",
        sourceRefId: updated.id,
        lines: [
          {
            accountCode: ACCOUNT_CODES.EXPENSE_MAINTENANCE,
            debit: costNum,
            description: updated.contractor
              ? `مقاول: ${updated.contractor}`
              : undefined,
          },
          { accountCode: ACCOUNT_CODES.CASH, credit: costNum },
        ],
      });
      await tx.transaction.create({
        data: {
          date: updated.completionDate ?? completionDate,
          description: `صيانة ${updated.unit.unitNumber} - ${updated.description}`,
          amount: costNum,
          type: "expense",
          account: "cash",
        },
      });
    }
  }

  return {
    id: updated.id,
    unitId: updated.unitId,
    status: updated.status,
    cost: costNum,
    completionDate: updated.completionDate,
    previousStatus,
  };
}
