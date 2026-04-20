/**
 * push-availability.ts — mark Extranet rooms open / closed based on local
 * reservations. Stub only.
 */

import { log } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { login } from "./login";

export interface PushAvailabilityPayload {
  credentialId: number;
  fromDate: string; // ISO
  toDate: string;   // ISO
  unitIds?: number[];
}

export interface PushAvailabilityResult {
  daysProcessed: number;
  closed: number;
  opened: number;
}

export async function pushAvailability(
  jobId: number,
  payload: PushAvailabilityPayload,
): Promise<PushAvailabilityResult> {
  if (!payload.credentialId || !payload.fromDate || !payload.toDate) {
    throw new Error("credentialId + fromDate + toDate مطلوبة");
  }
  const from = new Date(payload.fromDate);
  const to = new Date(payload.toDate);

  const reservations = await prisma.reservation.findMany({
    where: {
      status: "active",
      checkOut: { gte: from },
      checkIn: { lte: to },
      ...(payload.unitIds ? { unitId: { in: payload.unitIds } } : {}),
    },
    select: { unitId: true, checkIn: true, checkOut: true },
  });

  await log(jobId, "info", `Push Availability: ${reservations.length} حجز في النطاق`);

  const { bundle } = await login(jobId, payload.credentialId);
  try {
    // TODO: open calendar, close nights that are booked, open the others.
    await log(jobId, "warn", "(stub) لم يتم تنفيذ الإغلاق/الفتح بعد");
    return { daysProcessed: reservations.length, closed: 0, opened: 0 };
  } finally {
    await bundle.close().catch(() => {});
  }
}
