import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.booking:view");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const [job, logs] = await Promise.all([
      prisma.bookingSyncJob.findUnique({ where: { id } }),
      prisma.bookingSyncLog.findMany({
        where: { jobId: id },
        orderBy: { ts: "asc" },
        take: 500,
      }),
    ]);
    if (!job) return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    return NextResponse.json({ ...job, logs });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/booking/jobs/[id]:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/** DELETE cancels a pending job; running/done jobs cannot be cancelled via the API. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.booking:edit");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const job = await prisma.bookingSyncJob.findUnique({ where: { id } });
    if (!job) return NextResponse.json({ error: "المهمة غير موجودة" }, { status: 404 });
    if (job.status !== "pending") {
      return NextResponse.json(
        { error: "لا يمكن إلغاء مهمة قيد التنفيذ أو منتهية" },
        { status: 400 },
      );
    }

    const updated = await prisma.bookingSyncJob.update({
      where: { id },
      data: { status: "cancelled", finishedAt: new Date() },
    });
    await prisma.bookingSyncLog.create({
      data: { jobId: id, level: "warn", message: "تم إلغاء المهمة من المستخدم" },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/booking/jobs/[id]:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
