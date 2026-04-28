import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { confirmHold } from "@/lib/booking/hold";
import { loadConfiguredStripe } from "@/lib/payments/stripe";
import { sendBotText } from "@/lib/whatsapp/bot/sender";

/**
 * Stripe-called webhook. The signing secret lives encrypted in
 * `WhatsAppConfig.botStripeWebhookSecretEnc`. This route is intentionally
 * allowlisted in `scripts/check-permissions.ts` because Stripe — not a
 * logged-in user — is the caller; auth happens via the
 * `Stripe-Signature` header.
 *
 * Responsibilities:
 *   1. Verify the signature → if invalid, 401 (Stripe will retry).
 *   2. Idempotency: if we already confirmed the hold tied to this session,
 *      ack with 200 (Stripe re-delivers events on transient failures and
 *      we MUST be safe to receive the same event multiple times).
 *   3. On `session.completed`:
 *        a. If the hold is still pending and within its TTL → confirmHold
 *           runs the existing race-checked transaction + the WhatsApp
 *           auto-trigger that ships the contract PDF + welcome text.
 *        b. If the hold expired between payment authorisation and webhook
 *           delivery (rare but real) → Stripe refund + apologetic text.
 *   4. On `session.expired` / `session.failed`: nothing destructive — we
 *      just clean up the bot conversation pointer so the next user message
 *      can offer to retry.
 *
 * We always return 200 once signature verification passes, even if our
 * downstream work errors out, so Stripe doesn't pile retries on us. Errors
 * are logged and surfaced via observability.
 */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const provider = await loadConfiguredStripe();
  if (!provider) {
    console.warn("[stripe/webhook] not configured (no secret stored)");
    return new NextResponse("not configured", { status: 503 });
  }

  // Stripe REQUIRES the raw body for signature verification — never JSON-parse
  // before constructEvent(). Reading as text + Buffer.from preserves the bytes.
  const rawText = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  let event;
  try {
    event = provider.verifyWebhook(Buffer.from(rawText), headers);
  } catch (e) {
    console.warn("[stripe/webhook] signature verification failed:", e);
    return new NextResponse("invalid signature", { status: 401 });
  }

  try {
    if (event.type === "session.completed") {
      await handleCompleted(event.sessionId, event.metadata, event.paymentIntentId);
    } else if (event.type === "session.expired") {
      await handleExpired(event.sessionId, event.metadata);
    } else if (event.type === "session.failed") {
      await handleFailed(event.sessionId, event.metadata, event.errorMessage);
    } else {
      console.log("[stripe/webhook] ignored event type", event.type);
    }
  } catch (e) {
    // Log but don't 5xx — Stripe will keep retrying and that just spams us.
    console.error("[stripe/webhook] handler error:", e);
  }

  return NextResponse.json({ ok: true });
}

// ───────────────────────── handlers ─────────────────────────

async function handleCompleted(
  sessionId: string,
  metadata: Record<string, string> | undefined,
  paymentIntentId: string | null | undefined,
) {
  const holdIdRaw = metadata?.holdId;
  if (!holdIdRaw) {
    console.warn("[stripe/webhook] completed event has no holdId metadata", sessionId);
    return;
  }
  const holdId = Number(holdIdRaw);
  if (!Number.isFinite(holdId)) return;

  // ── Idempotency ──────────────────────────────────────────────────────
  // If the reservation is already confirmed (we processed an earlier delivery
  // of the same event), bail out clean.
  const existing = await prisma.reservation.findUnique({
    where: { id: holdId },
    select: {
      id: true,
      status: true,
      holdExpiresAt: true,
      guestAccountId: true,
      confirmationCode: true,
    },
  });

  if (!existing) {
    console.warn("[stripe/webhook] completed: hold not found", { holdId, sessionId });
    return;
  }

  if (existing.status !== "pending_hold") {
    // Already confirmed (or cancelled). Stripe replay of the same event.
    console.log("[stripe/webhook] idempotent ack — hold already settled", {
      holdId,
      status: existing.status,
    });
    // Persist the paymentIntentId for forensics if not already.
    if (paymentIntentId) {
      await prisma.reservation
        .update({
          where: { id: holdId },
          data: { paymentMethod: `stripe:${sessionId}:${paymentIntentId}` },
        })
        .catch(() => undefined);
    }
    return;
  }

  // ── Race: hold expired between checkout authorisation and webhook ─
  if (!existing.holdExpiresAt || existing.holdExpiresAt <= new Date()) {
    console.warn("[stripe/webhook] hold expired before webhook arrived — refunding", {
      holdId,
      sessionId,
    });
    try {
      const provider = await loadConfiguredStripe();
      await provider?.refund(sessionId);
    } catch (e) {
      console.error("[stripe/webhook] refund after expired hold failed", e);
    }
    await notifyGuest(
      existing.guestAccountId,
      `للأسف انتهت صلاحية الحجز قبل تأكيد الدفع، وتمّ ردّ المبلغ تلقائياً 🙏 ` +
        `يمكنك المحاولة مرة أخرى الآن وسأحجز لك فوراً.`,
    );
    return;
  }

  if (!existing.guestAccountId) {
    console.error("[stripe/webhook] hold has no guestAccountId — cannot confirm", { holdId });
    return;
  }

  // ── Happy path: confirm hold → triggers WhatsApp template + PDF ─────
  try {
    const result = await confirmHold({
      holdId,
      guestAccountId: existing.guestAccountId,
    });
    // Mark the bot conversation as confirmed so the next inbound from this
    // guest goes through the "post-booking" branch instead of trying to
    // sell a new room.
    await prisma.botConversation
      .updateMany({
        where: { lastHoldId: holdId },
        data: {
          state: "confirmed",
          paymentSessionId: null,
          paymentLinkUrl: null,
          paymentExpiresAt: null,
        },
      })
      .catch(() => undefined);

    // Persist the Stripe linkage on the reservation row.
    await prisma.reservation
      .update({
        where: { id: holdId },
        data: {
          paymentMethod: paymentIntentId
            ? `stripe:${sessionId}:${paymentIntentId}`
            : `stripe:${sessionId}`,
          paidAmount: { increment: 0 }, // accounting reconciliation lives elsewhere
        },
      })
      .catch(() => undefined);

    console.log("[stripe/webhook] confirmed hold", {
      holdId,
      reservationId: result.reservationId,
      confirmationCode: result.confirmationCode,
    });
  } catch (e) {
    console.error("[stripe/webhook] confirmHold failed AFTER successful payment", {
      holdId,
      sessionId,
      err: e,
    });
    // We took money but couldn't confirm — escalate via internal alert.
    // The booking confirmation auto-trigger will not fire; fall back to
    // a polite text and a forced staff ping by escalating the bot conv.
    await notifyGuest(
      existing.guestAccountId,
      `تمّ استلام دفعتك ✅ ولكن حصل خطأ بسيط أثناء تثبيت الحجز. ` +
        `زميلٌ بشري سيتواصل معك خلال دقائق لإكمال التأكيد، ولا داعي للقلق.`,
    );
    await prisma.botConversation
      .updateMany({
        where: { lastHoldId: holdId },
        data: {
          state: "escalated",
          escalatedAt: new Date(),
          escalationReason: "payment_post_confirm_failure",
        },
      })
      .catch(() => undefined);
  }
}

async function handleExpired(
  sessionId: string,
  metadata: Record<string, string> | undefined,
) {
  const holdId = Number(metadata?.holdId);
  if (!Number.isFinite(holdId)) return;

  // Surface a friendly retry prompt; do NOT delete the hold — `maybeSweepLazy`
  // already takes care of expired holds.
  const conv = await prisma.botConversation.findFirst({
    where: { paymentSessionId: sessionId },
    select: { id: true, contactPhone: true },
  });
  if (conv) {
    await prisma.botConversation.update({
      where: { id: conv.id },
      data: {
        state: "collecting",
        paymentSessionId: null,
        paymentLinkUrl: null,
        paymentExpiresAt: null,
      },
    });
    await sendBotText(
      conv.contactPhone,
      "انتهت صلاحية رابط الدفع ⏰ هل تود إعادة المحاولة بنفس التواريخ؟",
      { origin: "bot:stripe-webhook" },
    );
  }
}

async function handleFailed(
  sessionId: string,
  metadata: Record<string, string> | undefined,
  errorMessage: string | null | undefined,
) {
  const holdId = Number(metadata?.holdId);
  if (!Number.isFinite(holdId)) return;

  const conv = await prisma.botConversation.findFirst({
    where: { paymentSessionId: sessionId },
    select: { id: true, contactPhone: true },
  });
  if (!conv) return;

  await sendBotText(
    conv.contactPhone,
    `للأسف لم تنجح عملية الدفع${errorMessage ? ` (${errorMessage.slice(0, 80)})` : ""}.\n` +
      `تريد المحاولة بطريقة دفع أخرى؟ اضغط *حجز جديد* وسأنشئ رابطاً جديداً.`,
    { origin: "bot:stripe-webhook" },
  );

  await prisma.botConversation.update({
    where: { id: conv.id },
    data: {
      state: "collecting",
      paymentSessionId: null,
      paymentLinkUrl: null,
      paymentExpiresAt: null,
    },
  });
}

/**
 * Pull the contact phone for the given guest account and shoot them a
 * single text. Used for both the post-confirm reassurance and the rare
 * race-recovery refund message.
 */
async function notifyGuest(
  guestAccountId: number | null,
  text: string,
): Promise<void> {
  if (!guestAccountId) return;
  const guest = await prisma.guestAccount.findUnique({
    where: { id: guestAccountId },
    select: { phone: true },
  });
  if (!guest?.phone) return;
  await sendBotText(guest.phone, text, { origin: "bot:stripe-webhook" });
}
