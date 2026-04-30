import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { revokeSession } from "@/lib/assistant/whatsapp/session";
import { prisma } from "@/lib/prisma";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  try {
    await requirePermission("assistant:wa_revoke");
    const { id } = await params;
    const sessionId = Number(id);
    if (!Number.isFinite(sessionId)) {
      return NextResponse.json({ error: "id غير صالح" }, { status: 400 });
    }
    const exists = await prisma.assistantWaSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true },
    });
    if (!exists) {
      return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });
    }
    if (exists.status !== "active" && exists.status !== "pending_otp") {
      return NextResponse.json(
        { error: `لا يمكن إنهاء جلسة بحالة "${exists.status}"` },
        { status: 400 },
      );
    }
    await revokeSession({ sessionId, reason: "admin_revoke" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/wa/sessions/[id]/revoke", e);
    return NextResponse.json({ error: "فشل إنهاء الجلسة" }, { status: 500 });
  }
}
