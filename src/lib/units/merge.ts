/**
 * Helpers for the room-to-room merge feature.
 *
 * The merging happens between two physical `Unit` records via an adjoining
 * side door. The relationship is symmetric (1↔1): if unit A is merged with
 * unit B, then unit B is merged with unit A. We normalize storage so the
 * two ids are always stored in ascending order (a.id < b.id), which lets
 * us use a unique `(unitAId, unitBId)` constraint without ever creating a
 * mirrored duplicate row.
 *
 * Each Unit can participate in AT MOST one merge pair. This is enforced by
 * `@unique` on both `unitAId` and `unitBId` columns individually in the
 * Prisma schema, but we also perform an explicit pre-check in `createMerge`
 * so we can surface a friendly Arabic error message.
 */
import type { PrismaClient } from "@prisma/client";

/** Order two unit ids so the smaller id is returned first. */
export function orderMergeIds(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export interface MergeInput {
  unitId: number;
  otherUnitId: number;
  notes?: string | null;
}

export interface MergeSummary {
  id: number;
  unitA: { id: number; unitNumber: string; floor: number };
  unitB: { id: number; unitNumber: string; floor: number };
  notes: string | null;
  createdAt: Date;
}

const mergeInclude = {
  unitA: { select: { id: true, unitNumber: true, floor: true } },
  unitB: { select: { id: true, unitNumber: true, floor: true } },
} as const;

export async function getMergeForUnit(
  prisma: PrismaClient,
  unitId: number,
): Promise<MergeSummary | null> {
  const row = await prisma.unitMerge.findFirst({
    where: { OR: [{ unitAId: unitId }, { unitBId: unitId }] },
    include: mergeInclude,
  });
  return row
    ? {
        id: row.id,
        unitA: row.unitA,
        unitB: row.unitB,
        notes: row.notes,
        createdAt: row.createdAt,
      }
    : null;
}

export async function listMerges(prisma: PrismaClient): Promise<MergeSummary[]> {
  const rows = await prisma.unitMerge.findMany({
    orderBy: { createdAt: "desc" },
    include: mergeInclude,
  });
  return rows.map((r) => ({
    id: r.id,
    unitA: r.unitA,
    unitB: r.unitB,
    notes: r.notes,
    createdAt: r.createdAt,
  }));
}

/**
 * Units eligible to be merged with `unitId`:
 * - same floor
 * - different unit
 * - neither side currently participates in ANY merge
 * - (optionally) same unit-type category — merging a room with an apartment
 *   is usually not desirable, but the caller can override.
 */
export async function getMergeCandidates(
  prisma: PrismaClient,
  unitId: number,
): Promise<Array<{ id: number; unitNumber: string; floor: number; unitTypeId: number | null; unitTypeName: string | null }>> {
  const self = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true, floor: true },
  });
  if (!self) return [];

  // Ids already in a merge on either side.
  const existing = await prisma.unitMerge.findMany({
    select: { unitAId: true, unitBId: true },
  });
  const taken = new Set<number>();
  for (const m of existing) {
    taken.add(m.unitAId);
    taken.add(m.unitBId);
  }

  const rows = await prisma.unit.findMany({
    where: {
      id: { not: unitId, notIn: Array.from(taken) },
      floor: self.floor,
    },
    select: {
      id: true,
      unitNumber: true,
      floor: true,
      unitTypeId: true,
      unitTypeRef: { select: { nameAr: true } },
    },
    orderBy: { unitNumber: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    unitNumber: r.unitNumber,
    floor: r.floor,
    unitTypeId: r.unitTypeId,
    unitTypeName: r.unitTypeRef?.nameAr ?? null,
  }));
}

export class MergeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function createMerge(
  prisma: PrismaClient,
  input: MergeInput,
): Promise<MergeSummary> {
  if (!Number.isInteger(input.unitId) || !Number.isInteger(input.otherUnitId)) {
    throw new MergeError("معرّفات الوحدات غير صالحة");
  }
  if (input.unitId === input.otherUnitId) {
    throw new MergeError("لا يمكن ربط وحدة بنفسها");
  }

  const [aId, bId] = orderMergeIds(input.unitId, input.otherUnitId);

  const [a, b] = await Promise.all([
    prisma.unit.findUnique({
      where: { id: aId },
      select: { id: true, unitNumber: true, floor: true },
    }),
    prisma.unit.findUnique({
      where: { id: bId },
      select: { id: true, unitNumber: true, floor: true },
    }),
  ]);
  if (!a || !b) throw new MergeError("إحدى الوحدتين غير موجودة", 404);
  if (a.floor !== b.floor) {
    throw new MergeError(
      `لا يمكن دمج وحدتين في طابقين مختلفين (${a.unitNumber} في الطابق ${a.floor}، ${b.unitNumber} في الطابق ${b.floor})`,
    );
  }

  const conflict = await prisma.unitMerge.findFirst({
    where: {
      OR: [
        { unitAId: aId },
        { unitBId: aId },
        { unitAId: bId },
        { unitBId: bId },
      ],
    },
    include: mergeInclude,
  });
  if (conflict) {
    const stuck =
      conflict.unitAId === aId || conflict.unitBId === aId ? a : b;
    throw new MergeError(
      `الوحدة ${stuck.unitNumber} مرتبطة مسبقاً بدمج آخر — فكّ الارتباط أولاً.`,
      409,
    );
  }

  const created = await prisma.unitMerge.create({
    data: {
      unitAId: aId,
      unitBId: bId,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    },
    include: mergeInclude,
  });

  return {
    id: created.id,
    unitA: created.unitA,
    unitB: created.unitB,
    notes: created.notes,
    createdAt: created.createdAt,
  };
}

export async function deleteMerge(
  prisma: PrismaClient,
  mergeId: number,
): Promise<void> {
  const existing = await prisma.unitMerge.findUnique({ where: { id: mergeId } });
  if (!existing) throw new MergeError("الارتباط غير موجود", 404);
  await prisma.unitMerge.delete({ where: { id: mergeId } });
}
