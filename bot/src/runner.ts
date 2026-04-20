/**
 * runner.ts — main loop: polls `BookingSyncJob` for the next pending job,
 * dispatches it to the matching operation, and writes back status + result.
 *
 * Two modes:
 *   - default: poll forever every BOOKING_POLL_INTERVAL_MS (15s)
 *   - `--once`: process one job then exit (nice for cron).
 */

import * as dotenv from "dotenv";
import path from "node:path";

// Load env from the monorepo root (hotel-app/.env) if present, then from bot/.env
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { prisma } from "./lib/prisma";
import { log } from "./lib/logger";
import { pushPrices } from "./operations/push-prices";
import { pushAvailability } from "./operations/push-availability";
import { pullReservations } from "./operations/pull-reservations";
import { login } from "./operations/login";

const POLL_INTERVAL = Number(process.env.BOOKING_POLL_INTERVAL_MS || "15000");

type JobRow = Awaited<ReturnType<typeof pickNextJob>>;

async function pickNextJob() {
  return prisma.bookingSyncJob.findFirst({
    where: { status: "pending", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
  });
}

async function runJob(job: NonNullable<JobRow>) {
  await prisma.bookingSyncJob.update({
    where: { id: job.id },
    data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
  });
  await log(job.id, "info", `بدء التنفيذ (type=${job.type})`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (job.payloadJson ?? {}) as any;
  let result: unknown = null;
  try {
    switch (job.type) {
      case "login_check": {
        const bundle = await login(job.id, Number(payload.credentialId));
        await bundle.bundle.close();
        result = { ok: true };
        break;
      }
      case "push_prices":
        result = await pushPrices(job.id, payload);
        break;
      case "push_availability":
        result = await pushAvailability(job.id, payload);
        break;
      case "pull_reservations":
        result = await pullReservations(job.id, payload);
        break;
      default:
        throw new Error(`نوع مهمة غير معروف: ${job.type}`);
    }

    await prisma.bookingSyncJob.update({
      where: { id: job.id },
      data: {
        status: "done",
        finishedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resultJson: result as any,
      },
    });
    await log(job.id, "info", "تمت المهمة بنجاح", result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.bookingSyncJob.update({
      where: { id: job.id },
      data: { status: "failed", finishedAt: new Date(), error: msg },
    });
    await log(job.id, "error", `فشل التنفيذ: ${msg}`);
  }
}

async function loop(once: boolean) {
  console.log(`[runner] starting (once=${once}, poll=${POLL_INTERVAL}ms)`);
  for (;;) {
    const job = await pickNextJob();
    if (job) {
      await runJob(job);
      if (once) return;
      continue;
    }
    if (once) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

const once = process.argv.includes("--once");

loop(once)
  .catch((err) => {
    console.error("[runner] fatal:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
