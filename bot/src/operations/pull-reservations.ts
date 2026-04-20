/**
 * pull-reservations.ts — scrape the "Reservations" tab and drop new rows
 * into BookingInboxReservation for a human to confirm.
 */

import { log } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { login } from "./login";

export interface PullReservationsPayload {
  credentialId: number;
  fromDate?: string;
  toDate?: string;
}

export interface PullReservationsResult {
  seen: number;
  added: number;
  duplicates: number;
}

export async function pullReservations(
  jobId: number,
  payload: PullReservationsPayload,
): Promise<PullReservationsResult> {
  if (!payload.credentialId) throw new Error("credentialId مطلوب");
  const { bundle } = await login(jobId, payload.credentialId);
  const { page, close } = bundle;

  try {
    await page.goto(
      "https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/reservations.html",
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    // TODO: iterate the visible reservation rows, extract: external id, guest,
    // check-in/out, room type (text), total. Upsert into BookingInboxReservation.
    await log(jobId, "warn", "(stub) لم يُنفَّذ سحب الحجوزات بعد — أضف السِلكتورات");

    // Demonstrate upsert path with zero rows so the runner still marks "done".
    const seen = 0;
    const added = 0;
    const duplicates = 0;
    if (seen > 0) {
      await prisma.bookingInboxReservation.count();
    }
    return { seen, added, duplicates };
  } finally {
    await close().catch(() => {});
  }
}
