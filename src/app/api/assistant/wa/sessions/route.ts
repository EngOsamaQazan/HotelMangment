import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * Admin view of live WhatsApp staff-assistant sessions. Only `assistant:configure`
 * gets the full list — regular users do NOT need this; they manage their own
 * session through the WhatsApp messages themselves.
 */

export async function GET() {
  try {
    await requirePermission("assistant:configure");
    const rows = await prisma.assistantWaSession.findMany({
      where: { status: { in: ["pending_otp", "active", "locked"] } },
      orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true, whatsappPhone: true } },
      },
    });
    return NextResponse.json({
      sessions: rows.map((s) => ({
        id: s.id,
        status: s.status,
        phone: s.phone,
        userId: s.userId,
        userName: s.user.name,
        userEmail: s.user.email,
        lastActivityAt: s.lastActivityAt,
        sessionExpiresAt: s.sessionExpiresAt,
        otpExpiresAt: s.otpExpiresAt,
        otpAttempts: s.otpAttempts,
        conversationId: s.conversationId,
        createdAt: s.createdAt,
      })),
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("GET /api/assistant/wa/sessions", e);
    return NextResponse.json({ error: "فشل تحميل الجلسات" }, { status: 500 });
  }
}
