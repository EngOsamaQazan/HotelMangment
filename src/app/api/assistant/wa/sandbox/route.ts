import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { handleStaffWaMessage } from "@/lib/assistant/whatsapp/handler";

/**
 * Local-only tester for the WhatsApp staff assistant. Lets you debug the
 * full state machine (NoSession → AwaitingOtp → Active) without exposing
 * a public webhook URL or actually sending messages.
 *
 * Behaviour:
 *   • Routes through the real `handleStaffWaMessage()` so every gate and
 *     side-effect (OTP storage, AssistantWaSession transitions, executor
 *     calls) runs identically to production.
 *   • Sets `dryRun = true` so outbound messages are captured in the
 *     response payload instead of being delivered through Meta.
 *   • Uses the staff member's own `User.whatsappPhone` as the `phone`
 *     argument — refuses if the user has not set one in their profile.
 *
 * Permission: `assistant:wa_use` (the same one regular WhatsApp staff
 * usage requires).
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requirePermission("assistant:wa_use");
    const userId = Number((session.user as { id?: string | number }).id);

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, whatsappPhone: true, name: true },
    });
    if (!me) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    if (!me.whatsappPhone) {
      return NextResponse.json(
        { error: "لم يتم تسجيل رقم واتس لحسابك. أضِفه من الملف الشخصي ثم أعد المحاولة." },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      reset?: boolean;
    };

    if (body.reset) {
      await prisma.assistantWaSession.updateMany({
        where: {
          userId: me.id,
          phone: me.whatsappPhone,
          status: { in: ["pending_otp", "active", "locked"] },
        },
        data: { status: "revoked", revokedAt: new Date(), revokedReason: "sandbox_reset" },
      });
      return NextResponse.json({ ok: true, reset: true });
    }

    const text = (body.message ?? "").trim();
    if (!text) {
      return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
    }

    const captured: string[] = [];
    const result = await handleStaffWaMessage({
      staffUserId: me.id,
      phone: me.whatsappPhone,
      body: text,
      type: "text",
      receivedAt: new Date(),
      conversationId: null,
      capture: captured,
      dryRun: true,
    });

    const sessionRow = await prisma.assistantWaSession.findFirst({
      where: { userId: me.id, phone: me.whatsappPhone },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        otpAttempts: true,
        otpExpiresAt: true,
        sessionExpiresAt: true,
        lastActivityAt: true,
        conversationId: true,
      },
    });

    // Pull the rich AssistantAction rows for new drafts so the UI can
    // render the same `ActionDraftCard` it shows on /assistant.
    const newActions =
      result.pendingActionIds && result.pendingActionIds.length > 0
        ? await prisma.assistantAction.findMany({
            where: { id: { in: result.pendingActionIds } },
            orderBy: { id: "asc" },
          })
        : [];

    return NextResponse.json({
      replies: captured,
      result: { replied: result.replied, reason: result.reason },
      session: sessionRow,
      conversationId: result.conversationId ?? sessionRow?.conversationId ?? null,
      actions: newActions,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/wa/sandbox", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "خطأ داخلي" },
      { status: 500 },
    );
  }
}
