import "server-only";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/booking/encryption";
import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  PaymentEvent,
  PaymentEventType,
  PaymentProvider,
} from "./types";

/**
 * Stripe Checkout adapter.
 *
 * Why Stripe Checkout (not Payment Intents directly):
 *   • One configuration enables Apple Pay, Google Pay, Link, and every
 *     supported card brand automatically (`automatic_payment_methods.enabled
 *     = true`). The guest sees the methods their device/region supports
 *     without any per-method work on our side — exactly what the user asked
 *     for: "يخير العميل بطريقة الدفع المفضلة".
 *   • PCI-DSS scope is reduced to SAQ-A (we never touch card data).
 *   • The hosted page is bilingual (Arabic + English), mobile-friendly,
 *     and accessible — much faster to ship than a custom UI.
 *
 * JOD support:
 *   Stripe MEA accounts can transact in JOD natively. Older accounts that
 *   only have USD enabled should switch the storefront currency in
 *   `WhatsAppConfig.botPaymentCurrency` to "USD" — the booking engine
 *   continues to compute amounts in JOD and we convert at the daily rate
 *   pulled from `process.env.JOD_USD_RATE` (set by ops; defaults to 1.41).
 */

const ENV_CURRENCIES_NEEDING_USD_CONVERSION = new Set(["USD"]);

let cached: { provider: StripeProvider; secretFingerprint: string } | null = null;

function fingerprint(secret: string): string {
  return secret.slice(0, 7) + "…" + secret.slice(-4);
}

/**
 * Lazily build (and cache) the configured Stripe adapter from the encrypted
 * secret stored on `WhatsAppConfig`. Returns null when no secret is set.
 */
export async function loadConfiguredStripe(): Promise<StripeProvider | null> {
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: {
      botStripeSecretKeyEnc: true,
      botStripeWebhookSecretEnc: true,
      botPaymentCurrency: true,
    },
  });

  const enc = cfg?.botStripeSecretKeyEnc;
  if (!enc) return null;
  const secret = decryptSecret(enc);
  if (!secret) return null;

  const fp = fingerprint(secret);
  if (cached && cached.secretFingerprint === fp) return cached.provider;

  const webhookSecret = cfg?.botStripeWebhookSecretEnc
    ? decryptSecret(cfg.botStripeWebhookSecretEnc)
    : "";

  const provider = new StripeProvider({
    secretKey: secret,
    webhookSecret,
    storefrontCurrency: (cfg?.botPaymentCurrency ?? "JOD").toUpperCase(),
  });
  cached = { provider, secretFingerprint: fp };
  return provider;
}

/** Test-only: drop the singleton between unit tests. */
export function _resetStripeCache(): void {
  cached = null;
}

interface StripeProviderOptions {
  secretKey: string;
  webhookSecret: string;
  storefrontCurrency: string;
}

class StripeProvider implements PaymentProvider {
  public readonly id = "stripe" as const;
  private readonly client: Stripe;
  private readonly webhookSecret: string;
  private readonly storefrontCurrency: string;

  constructor(opts: StripeProviderOptions) {
    this.client = new Stripe(opts.secretKey, {
      // Pin the API version explicitly so a Stripe SDK upgrade can't quietly
      // change webhook payload shape on us. Bump only when we audit deltas.
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
    this.webhookSecret = opts.webhookSecret;
    this.storefrontCurrency = opts.storefrontCurrency;
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CheckoutSession> {
    const { amount, currency } = this.toStorefront(input.amount, input.currency);

    // We deliberately do NOT pass `payment_method_types` here. Modern Stripe
    // Checkout (Dashboard-managed) automatically surfaces every method
    // enabled in Settings → Payment methods, including Apple Pay, Google
    // Pay, Link, and all card brands — exactly the multi-method experience
    // the operator asked for. Hard-coding the list disables that magic.
    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: input.descriptor.slice(0, 250),
            },
          },
        },
      ],
      // expires_at is in seconds since epoch. Stripe enforces a minimum of
      // 30 minutes from now and a maximum of 24 hours.
      expires_at: Math.max(
        Math.floor(Date.now() / 1000) + 30 * 60 + 1,
        Math.floor(input.expiresAt.getTime() / 1000),
      ),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.guestEmail,
      // Forwarded back on every webhook event — primary key for our linkage.
      metadata: {
        ...input.metadata,
        holdId: String(input.holdId),
      },
      payment_intent_data: {
        // Mirror metadata onto the underlying PaymentIntent so refunds and
        // dispute lookups in the Stripe dashboard show the booking context.
        metadata: {
          ...input.metadata,
          holdId: String(input.holdId),
        },
        statement_descriptor_suffix: input.descriptor.slice(0, 22),
      },
    });

    if (!session.url) {
      throw new Error("Stripe createCheckoutSession returned no url");
    }
    return { sessionId: session.id, url: session.url };
  }

  verifyWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string>,
  ): PaymentEvent {
    if (!this.webhookSecret) {
      throw new Error("Stripe webhook secret not configured");
    }
    const sig = headers["stripe-signature"] ?? headers["Stripe-Signature"];
    if (!sig) throw new Error("missing Stripe-Signature header");

    const event = this.client.webhooks.constructEvent(
      rawBody,
      sig,
      this.webhookSecret,
    );

    return this.mapEvent(event);
  }

  async refund(sessionId: string, amount?: number): Promise<void> {
    const session = await this.client.checkout.sessions.retrieve(sessionId);
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) {
      throw new Error("refund: session has no payment_intent yet");
    }
    await this.client.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount ? { amount } : {}),
      reason: "requested_by_customer",
    });
  }

  // ─────────────────────────── private ────────────────────────────

  /**
   * Booking engine returns JOD; Stripe accounts that haven't enabled JOD
   * need a USD fallback. We avoid silently rounding by computing the cents
   * conversion explicitly from `JOD_USD_RATE`.
   */
  private toStorefront(
    amountMinor: number,
    sourceCurrency: string,
  ): { amount: number; currency: string } {
    const target = this.storefrontCurrency;
    if (target === sourceCurrency) {
      return { amount: amountMinor, currency: target };
    }
    if (
      sourceCurrency === "JOD" &&
      ENV_CURRENCIES_NEEDING_USD_CONVERSION.has(target)
    ) {
      const rate = Number(process.env.JOD_USD_RATE ?? "1.41");
      // amountMinor is JOD * 100; USD has 2 dp too → multiply by rate, round.
      const usdMinor = Math.round(amountMinor * rate);
      return { amount: usdMinor, currency: "USD" };
    }
    // Unknown conversion path — pass through and let Stripe error out so
    // we notice instead of silently mis-charging the guest.
    return { amount: amountMinor, currency: target };
  }

  private mapEvent(event: Stripe.Event): PaymentEvent {
    const type: PaymentEventType | null = (() => {
      switch (event.type) {
        case "checkout.session.completed":
          return "session.completed";
        case "checkout.session.expired":
          return "session.expired";
        case "checkout.session.async_payment_failed":
        case "payment_intent.payment_failed":
          return "session.failed";
        default:
          return null;
      }
    })();

    if (!type) {
      // Unknown / uninteresting event — surface raw so the route can ack
      // without action.
      return {
        type: "session.failed",
        sessionId: "unknown",
        raw: event,
        errorMessage: `unhandled event type: ${event.type}`,
      };
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    return {
      type,
      sessionId: session.id ?? "",
      paymentIntentId,
      amount: session.amount_total ?? undefined,
      currency: (session.currency ?? "").toUpperCase() || undefined,
      metadata: (session.metadata ?? {}) as Record<string, string>,
      paidAt:
        type === "session.completed" && session.created
          ? new Date(session.created * 1000)
          : undefined,
      raw: event,
    };
  }
}
