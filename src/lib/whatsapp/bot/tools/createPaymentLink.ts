import "server-only";
import { prisma } from "@/lib/prisma";
import {
  err,
  ok,
  type ToolContext,
  type ToolJsonSchema,
  type ToolResult,
} from "./types";

/**
 * Create a hosted-checkout payment link for the active hold and surface its
 * URL to the guest. The actual provider (Stripe by default) is plugged in
 * via `getDefaultPaymentProvider()` from `@/lib/payments` (Phase 2).
 *
 * Until Phase 2 ships, this tool returns a clean "provider_not_configured"
 * error which the LLM is instructed (in the system prompt) to translate to
 * "ساوصلك بزميل بشري لإكمال الدفع — لحظة" → escalateToHuman. That makes
 * Phase 1 fully usable end-to-end (search → quote → hold → human handoff)
 * before the Stripe code lands.
 *
 * Side effects on success:
 *   • BotConversation: paymentSessionId, paymentLinkUrl, paymentExpiresAt,
 *     state = "awaiting_payment".
 */

export interface CreatePaymentLinkInput {
  holdId: number;
}

export interface CreatePaymentLinkOutput {
  url: string;
  sessionId: string;
  expiresAtIso: string;
  amount: number;
  currency: string;
}

export async function createPaymentLink(
  input: CreatePaymentLinkInput,
  ctx: ToolContext,
): Promise<ToolResult<CreatePaymentLinkOutput>> {
  if (!input.holdId || typeof input.holdId !== "number") {
    return err({ code: "bad_input", message: "holdId required", field: "holdId" });
  }

  const hold = await prisma.reservation.findUnique({
    where: { id: input.holdId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      holdExpiresAt: true,
      guestAccountId: true,
      checkIn: true,
      checkOut: true,
    },
  });
  if (!hold) {
    return err({ code: "not_found", message: "الحجز المؤقت غير موجود." });
  }
  if (hold.status !== "pending_hold") {
    return err({
      code: "bad_input",
      message: "لا يمكن إنشاء رابط دفع لحجز مؤكد أو منتهٍ.",
    });
  }
  if (!hold.holdExpiresAt || hold.holdExpiresAt <= new Date()) {
    return err({
      code: "unavailable",
      message: "انتهت صلاحية الحجز المؤقّت قبل إنشاء رابط الدفع.",
    });
  }
  if (
    ctx.guestAccount &&
    hold.guestAccountId &&
    hold.guestAccountId !== ctx.guestAccount.id
  ) {
    return err({ code: "bad_input", message: "هذا الحجز يخص حساباً آخر." });
  }

  // ── Provider lookup ───────────────────────────────────────────────────
  const { getDefaultPaymentProviderAsync } = await import("@/lib/payments");
  const provider = await getDefaultPaymentProviderAsync();
  if (!provider) {
    return err({
      code: "provider_error",
      message:
        "لم يتم ضبط بوابة الدفع بعد. سيتولى زميل بشري إكمال الحجز معك خلال لحظات.",
      provider: "none",
    });
  }

  // Stripe (and most gateways) want session expiry strictly inside the
  // hold window. We give the guest the hold-window minus 60 seconds so the
  // session can never accept money after the hold has expired.
  const minPad = 60_000;
  const expiresAt = new Date(
    Math.max(Date.now() + 5 * 60_000, hold.holdExpiresAt.getTime() - minPad),
  );

  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  const baseUrl = (cfg?.botPublicBaseUrl?.replace(/\/$/, "") || "https://example.com");
  // success_url is shown immediately after payment; the actual confirmation
  // (with code) happens via the Stripe webhook → `confirmHold` → WhatsApp
  // template, so this page just needs to say "تم الدفع، شيك واتسابك".
  const successUrl = `${baseUrl}/book/payment-success?hold=${hold.id}`;
  const cancelUrl = `${baseUrl}/book/payment-cancelled?hold=${hold.id}`;

  try {
    const session = await provider.createCheckoutSession({
      holdId: hold.id,
      amount: Math.round(Number(hold.totalAmount) * 100),
      currency: cfg?.botPaymentCurrency || "JOD",
      descriptor: `Hotel hold #${hold.id}`,
      expiresAt,
      successUrl,
      cancelUrl,
      metadata: {
        holdId: String(hold.id),
        botConvId: String(ctx.botConv.id),
        contactPhone: ctx.contactPhone,
      },
    });

    await prisma.botConversation.update({
      where: { id: ctx.botConv.id },
      data: {
        paymentSessionId: session.sessionId,
        paymentLinkUrl: session.url,
        paymentExpiresAt: expiresAt,
        state: "awaiting_payment",
      },
    });

    // Mirror the session id onto the reservation so the Stripe webhook can
    // find it via either lookup path.
    await prisma.reservation
      .update({
        where: { id: hold.id },
        data: { paymentMethod: `stripe:${session.sessionId}` },
      })
      .catch(() => {
        /* paymentMethod is best-effort; ignore if column constraints differ */
      });

    return ok({
      url: session.url,
      sessionId: session.sessionId,
      expiresAtIso: expiresAt.toISOString(),
      amount: Number(hold.totalAmount),
      currency: cfg?.botPaymentCurrency || "JOD",
    });
  } catch (e) {
    console.error("[bot/tools/createPaymentLink] provider failed", e);
    return err({
      code: "provider_error",
      message: "تعذّر إنشاء رابط الدفع حالياً. سأحوّلك لزميل بشري.",
      provider: provider.id,
    });
  }
}

export const createPaymentLinkSchema: ToolJsonSchema = {
  name: "createPaymentLink",
  description:
    "Generate a hosted Stripe Checkout link (Apple Pay, Google Pay, cards) for the active hold and send it to the guest. The link expires shortly before the hold itself, so the guest cannot pay for an already-lost room. After this returns ok, message the guest with the URL and remind them how many minutes they have.",
  parameters: {
    type: "object",
    properties: {
      holdId: {
        type: "integer",
        description: "The holdId returned by createHold.",
      },
    },
    required: ["holdId"],
    additionalProperties: false,
  },
};
