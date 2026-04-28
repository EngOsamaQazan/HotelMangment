import "server-only";
import type { PaymentProvider } from "./types";

/**
 * Provider lookup for the bot tools and the Stripe webhook route.
 *
 * Phase 1: returns null when no provider is configured (the bot tool surfaces
 * a clean "provider_error" → escalateToHuman path).
 * Phase 2: lazy-loads the Stripe adapter when `WhatsAppConfig.botStripeSecretKeyEnc`
 * is populated.
 *
 * We accept a small dynamic import here because the Stripe SDK is heavy and
 * we don't want to bundle it onto every cold-start that doesn't touch payments.
 */

export type { PaymentProvider } from "./types";
export type {
  CreateCheckoutSessionInput,
  CheckoutSession,
  PaymentEvent,
  PaymentEventType,
  PaymentProviderId,
} from "./types";

/**
 * Synchronous accessor used by the bot tools. Returns null when no
 * provider is configured yet — caller is expected to surface a clean
 * "provider_error" → escalate-to-human path.
 *
 * For now the only real implementation is Stripe. The lookup is async
 * because the secret lives encrypted in the DB; bot tools `await` it via
 * `getDefaultPaymentProviderAsync` below. The synchronous accessor is
 * kept so tests can register a mock provider without hitting Prisma.
 */
let mock: PaymentProvider | null | undefined;

export function getDefaultPaymentProvider(): PaymentProvider | null {
  if (mock !== undefined) return mock;
  // Bot tools (and routes) should prefer the async accessor — the sync one
  // returns null in production so we don't accidentally short-circuit the
  // DB-backed lookup.
  return null;
}

export async function getDefaultPaymentProviderAsync(): Promise<PaymentProvider | null> {
  if (mock !== undefined) return mock;
  const { loadConfiguredStripe } = await import("./stripe");
  return loadConfiguredStripe();
}

/** Test-only: register a mock provider, or pass null to disable. */
export function _setMockProvider(provider: PaymentProvider | null): void {
  mock = provider;
}

/** Test-only: clear all caches. */
export function _resetPaymentProviderCache(): void {
  mock = undefined;
}
