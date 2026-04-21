/**
 * Reservation lifecycle sweeper.
 *
 * Transitions reservations + units through time-based states:
 *
 *  • `upcoming` → `active`  when `checkIn <= now`. The target unit is marked
 *    `occupied` (unless another active reservation already has it).
 *
 *  • `active`   → `completed` when `checkOut <= now`. If no other active
 *    reservation overlaps right now, the unit is flipped to `maintenance`
 *    so the housekeeping team can clean it. Staff flip it back to
 *    `available` themselves from the rooms UI.
 *
 * The sweeper is safe to run as often as you want; all the queries are
 * scoped to reservations whose deadlines have actually passed, and every
 * write is idempotent.
 *
 * Call sites:
 *   - `GET /api/cron/reservations-sweep`  (external scheduler / systemd timer)
 *   - `maybeSweepLazy()` inside `/api/rooms` + `/api/reservations` GET
 *     handlers (throttled, so we piggyback on normal user traffic).
 */

import { prisma } from "@/lib/prisma";
import { logStatusTransition } from "@/lib/reservations/statusLog";

export interface SweepResult {
  activated: number;
  completed: number;
  unitsToMaintenance: number;
  unitsToOccupied: number;
  ranAt: string;
}

export async function sweepReservations(now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = {
    activated: 0,
    completed: 0,
    unitsToMaintenance: 0,
    unitsToOccupied: 0,
    ranAt: now.toISOString(),
  };

  // ── 1. Activate upcoming reservations whose start time has arrived ──
  // We also need their checkOut to still be in the future; otherwise the
  // reservation is effectively already finished and should be completed.
  const toActivate = await prisma.reservation.findMany({
    where: {
      status: "upcoming",
      checkIn: { lte: now },
    },
    select: { id: true, unitId: true, checkOut: true },
  });

  for (const r of toActivate) {
    if (r.checkOut <= now) {
      // Degenerate case: upcoming reservation whose window already closed.
      await prisma.$transaction(async (tx) => {
        await tx.reservation.update({
          where: { id: r.id },
          data: { status: "completed" },
        });
        await logStatusTransition(tx, {
          reservationId: r.id,
          fromStatus: "upcoming",
          toStatus: "completed",
          action: "auto_complete",
          reason: "الحجز انتهى وقته قبل أن يُسجّل دخوله — إنهاء تلقائي",
          actorUserId: null,
        });
      });
      result.completed += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: r.id },
        data: { status: "active" },
      });
      const unit = await tx.unit.findUnique({
        where: { id: r.unitId },
        select: { status: true },
      });
      if (unit && unit.status !== "occupied") {
        await tx.unit.update({
          where: { id: r.unitId },
          data: { status: "occupied" },
        });
        result.unitsToOccupied += 1;
      }
      await logStatusTransition(tx, {
        reservationId: r.id,
        fromStatus: "upcoming",
        toStatus: "active",
        action: "auto_activate",
        reason: "وصل تاريخ الدخول — تفعيل تلقائي",
        actorUserId: null,
      });
    });
    result.activated += 1;
  }

  // ── 2. Complete reservations whose end time has passed ──
  const toComplete = await prisma.reservation.findMany({
    where: {
      status: "active",
      checkOut: { lte: now },
    },
    select: { id: true, unitId: true },
  });

  // Group by unit so we only evaluate each unit once when deciding
  // whether to flip it to maintenance.
  const unitIdsAffected = new Set<number>();

  for (const r of toComplete) {
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: r.id },
        data: { status: "completed" },
      });
      await logStatusTransition(tx, {
        reservationId: r.id,
        fromStatus: "active",
        toStatus: "completed",
        action: "auto_complete",
        reason: "انتهى تاريخ الخروج — إنهاء تلقائي",
        actorUserId: null,
      });
    });
    result.completed += 1;
    unitIdsAffected.add(r.unitId);
  }

  // ── 3. Decide per-unit status transition ──
  for (const unitId of unitIdsAffected) {
    const stillActive = await prisma.reservation.count({
      where: {
        unitId,
        status: "active",
        checkIn: { lte: now },
        checkOut: { gt: now },
      },
    });

    if (stillActive > 0) continue;

    // Another reservation starting right now? Promote it instead of going
    // through maintenance — we never want to block an already-scheduled guest.
    const startingNow = await prisma.reservation.findFirst({
      where: {
        unitId,
        status: "upcoming",
        checkIn: { lte: now },
        checkOut: { gt: now },
      },
      select: { id: true },
    });

    if (startingNow) {
      await prisma.$transaction(async (tx) => {
        await tx.reservation.update({
          where: { id: startingNow.id },
          data: { status: "active" },
        });
        await tx.unit.update({
          where: { id: unitId },
          data: { status: "occupied" },
        });
        await logStatusTransition(tx, {
          reservationId: startingNow.id,
          fromStatus: "upcoming",
          toStatus: "active",
          action: "auto_activate",
          reason: "الوحدة أصبحت شاغرة ويوجد حجز بدأ وقته — تفعيل تلقائي",
          actorUserId: null,
        });
      });
      result.activated += 1;
      result.unitsToOccupied += 1;
      continue;
    }

    // No overlap / no queued reservation → needs cleaning.
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      select: { status: true },
    });
    if (unit && unit.status === "occupied") {
      await prisma.unit.update({
        where: { id: unitId },
        data: { status: "maintenance" },
      });
      result.unitsToMaintenance += 1;
    }
  }

  return result;
}

// ── Lazy / throttled invocation from hot read paths ──

let lastRunAt = 0;
const LAZY_INTERVAL_MS = 60_000; // run at most once a minute from user traffic

/**
 * Runs the sweeper at most once per `LAZY_INTERVAL_MS` per server process.
 * Safe to call from any GET handler; failures are swallowed so they never
 * break the surrounding request.
 */
export async function maybeSweepLazy(): Promise<void> {
  const now = Date.now();
  if (now - lastRunAt < LAZY_INTERVAL_MS) return;
  lastRunAt = now;
  try {
    await sweepReservations(new Date(now));
  } catch (err) {
    console.error("[reservations] lazy sweep failed:", err);
  }
}
