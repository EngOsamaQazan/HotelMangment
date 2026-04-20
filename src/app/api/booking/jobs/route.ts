import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError, getSessionOrThrow } from "@/lib/permissions/guard";

const VALID_TYPES = new Set([
  "login_check",
  "push_prices",
  "push_availability",
  "pull_reservations",
]);

/** GET /api/booking/jobs — list jobs with optional status filter. */
export async function GET(request: Request) {
  try {
    await requirePermission("settings.booking:view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    const jobs = await prisma.bookingSyncJob.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(jobs);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/booking/jobs:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/booking/jobs — enqueue a new job.
 * Body: { type: string, payload?: object, scheduledAt?: ISO }
 */
export async function POST(request: Request) {
  try {
    await requirePermission("settings.booking:trigger");
    const session = await getSessionOrThrow().catch(() => null);
    const userId = session
      ? Number((session.user as { id?: number | string } | undefined)?.id) || null
      : null;
    const body = await request.json();
    const type = String(body.type || "");
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json(
        { error: `نوع مهمة غير مدعوم. المدعوم: ${Array.from(VALID_TYPES).join(", ")}` },
        { status: 400 },
      );
    }

    const job = await prisma.bookingSyncJob.create({
      data: {
        type,
        status: "pending",
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
        payloadJson: body.payload ?? null,
        createdBy: userId,
      },
    });

    await prisma.bookingSyncLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: `مهمة جديدة (${type}) أُضيفت إلى قائمة الانتظار`,
      },
    });

    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/booking/jobs:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
