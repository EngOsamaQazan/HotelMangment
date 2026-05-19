"use client";

export const GOOGLE_ADS_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || "";
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";
export const GOOGLE_BOOKING_CONVERSION_LABEL =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION_LABEL?.trim() || "";

export const GOOGLE_TAG_ID = GOOGLE_ADS_ID || GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function hasGoogleTag(): boolean {
  return Boolean(GOOGLE_TAG_ID);
}

export function sendGooglePageView(url: string): void {
  if (typeof window === "undefined" || !window.gtag) return;
  if (GOOGLE_ADS_ID) {
    window.gtag("config", GOOGLE_ADS_ID, { page_path: url });
  }
  if (GA_MEASUREMENT_ID) {
    window.gtag("config", GA_MEASUREMENT_ID, { page_path: url });
  }
}

export function sendBookingConversion({
  transactionId,
  value,
  currency,
}: {
  transactionId: string;
  value: number;
  currency: string;
}): void {
  if (typeof window === "undefined" || !window.gtag) return;
  const safeValue = Number.isFinite(value) ? value : 0;

  if (GA_MEASUREMENT_ID) {
    window.gtag("event", "purchase", {
      send_to: GA_MEASUREMENT_ID,
      transaction_id: transactionId,
      value: safeValue,
      currency,
    });
  }

  if (GOOGLE_ADS_ID && GOOGLE_BOOKING_CONVERSION_LABEL) {
    window.gtag("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_BOOKING_CONVERSION_LABEL}`,
      transaction_id: transactionId,
      value: safeValue,
      currency,
    });
  }
}
