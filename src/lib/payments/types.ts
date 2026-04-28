import "server-only";

/**
 * Provider-agnostic payment-gateway interface.
 *
 * Phase 2 wires Stripe behind it; Phase 6+ may add HyperPay (MENA cards/MADA)
 * or Tap (Apple Pay shortcuts). The bot tools only ever talk to the
 * abstract `PaymentProvider` returned by `getDefaultPaymentProvider()` so
 * adding a new gateway never touches `src/lib/whatsapp/bot/`.
 */

export type PaymentProviderId = "stripe" | "hyperpay" | "tap";

export interface CreateCheckoutSessionInput {
  /** Reservation row currently in `pending_hold` status. */
  holdId: number;
  /** Amount in MINOR units of `currency` (e.g. 17000 = 170.00 JOD). */
  amount: number;
  /** ISO 4217 uppercase code. Must be a currency the provider supports. */
  currency: string;
  /** Short statement descriptor — visible on the card statement. */
  descriptor: string;
  /** Optional guest email Stripe pre-fills on the checkout page. */
  guestEmail?: string;
  /** Hard expiry — provider rejects payments after this instant. */
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
  /** Forwarded back to us on every webhook event. */
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  sessionId: string;
  /** Hosted checkout URL we send to the guest. */
  url: string;
}

export type PaymentEventType =
  | "session.completed"
  | "session.expired"
  | "session.failed";

export interface PaymentEvent {
  type: PaymentEventType;
  sessionId: string;
  paymentIntentId?: string | null;
  amount?: number;
  currency?: string;
  metadata?: Record<string, string>;
  /** When Stripe says the session was paid. */
  paidAt?: Date;
  /** Provider-attached error message, if any. */
  errorMessage?: string | null;
  /** Untouched raw event for forensics. */
  raw: unknown;
}

export interface PaymentProvider {
  id: PaymentProviderId;
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  /**
   * Verify a webhook payload's signature and parse it into our shape.
   * Throws when the signature is invalid — the route MUST treat that as
   * an authentication failure (401), not a server error.
   */
  verifyWebhook(rawBody: Buffer | string, headers: Record<string, string>): PaymentEvent;
  /**
   * Refund an already-captured charge. Pass `amount` (minor units) for a
   * partial refund, or omit for a full refund.
   */
  refund(sessionId: string, amount?: number): Promise<void>;
}
