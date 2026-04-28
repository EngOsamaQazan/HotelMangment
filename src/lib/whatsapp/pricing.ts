import "server-only";

/**
 * Static fallback pricing table used ONLY when Meta's analytics API does not
 * return a cost field for the requested period (e.g. very recent messages
 * not yet rolled up, or accounts where the analytics permission is missing).
 *
 * Numbers below are USD per *conversation* under Meta's classic per-conversation
 * pricing model and were sourced from Meta's official "WhatsApp Business
 * Platform pricing" page (rates per market vary by category).
 *
 *   https://developers.facebook.com/docs/whatsapp/pricing
 *
 * For real billing always trust Meta's reported cost — this table is a *best
 * effort* estimate to give the operator a meaningful number when Meta's API
 * has not yet returned data for the period.
 *
 * To update: edit `RATES`, bump `PRICING_LAST_UPDATED`, and ship.
 */

export const PRICING_LAST_UPDATED = "2026-04-01";

export const PRICING_REFERENCE_URL = "https://developers.facebook.com/docs/whatsapp/pricing";

/**
 * Country (ISO-2) → category → USD price per conversation.
 * "*" is the default fallback for any country not listed below.
 */
const RATES: Record<string, Record<string, number>> = {
  // ── MENA ──
  JO: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0648,
    UTILITY: 0.018,
    SERVICE: 0.0,
  },
  SA: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  AE: {
    AUTHENTICATION: 0.0312,
    MARKETING: 0.0364,
    UTILITY: 0.011,
    SERVICE: 0.0,
  },
  EG: {
    AUTHENTICATION: 0.106,
    MARKETING: 0.1597,
    UTILITY: 0.0541,
    SERVICE: 0.0,
  },
  QA: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  KW: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  BH: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  OM: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  IQ: {
    AUTHENTICATION: 0.0533,
    MARKETING: 0.0666,
    UTILITY: 0.0152,
    SERVICE: 0.0,
  },
  LB: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  YE: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  PS: {
    AUTHENTICATION: 0.0353,
    MARKETING: 0.0418,
    UTILITY: 0.0114,
    SERVICE: 0.0,
  },
  MA: {
    AUTHENTICATION: 0.0566,
    MARKETING: 0.0689,
    UTILITY: 0.0136,
    SERVICE: 0.0,
  },
  DZ: {
    AUTHENTICATION: 0.0566,
    MARKETING: 0.0689,
    UTILITY: 0.0136,
    SERVICE: 0.0,
  },
  TN: {
    AUTHENTICATION: 0.0566,
    MARKETING: 0.0689,
    UTILITY: 0.0136,
    SERVICE: 0.0,
  },

  // ── Major non-MENA markets, useful for guests roaming ──
  US: {
    AUTHENTICATION: 0.0135,
    MARKETING: 0.025,
    UTILITY: 0.004,
    SERVICE: 0.0,
  },
  GB: {
    AUTHENTICATION: 0.0358,
    MARKETING: 0.0529,
    UTILITY: 0.0151,
    SERVICE: 0.0,
  },
  DE: {
    AUTHENTICATION: 0.0768,
    MARKETING: 0.1365,
    UTILITY: 0.0628,
    SERVICE: 0.0,
  },
  FR: {
    AUTHENTICATION: 0.063,
    MARKETING: 0.1432,
    UTILITY: 0.04,
    SERVICE: 0.0,
  },
  IT: {
    AUTHENTICATION: 0.0301,
    MARKETING: 0.0691,
    UTILITY: 0.0301,
    SERVICE: 0.0,
  },
  TR: {
    AUTHENTICATION: 0.011,
    MARKETING: 0.0107,
    UTILITY: 0.0035,
    SERVICE: 0.0,
  },
  IN: {
    AUTHENTICATION: 0.0014,
    MARKETING: 0.0107,
    UTILITY: 0.0014,
    SERVICE: 0.0,
  },

  // Wildcard — used only when no country match is available.
  "*": {
    AUTHENTICATION: 0.04,
    MARKETING: 0.06,
    UTILITY: 0.015,
    SERVICE: 0.0,
  },
};

const ALIASES: Record<string, string> = {
  AUTH: "AUTHENTICATION",
  AUTHENTICATION_INTERNATIONAL: "AUTHENTICATION",
  REFERRAL_CONVERSION: "MARKETING",
  USER_INITIATED: "SERVICE",
  BUSINESS_INITIATED: "UTILITY",
};

/**
 * Lookup price (USD) per conversation for the supplied category and ISO-2
 * country. Falls back to wildcard market and to UTILITY category when an
 * exact match is not found.
 */
export function getPriceForCategoryCountry(category: string, country: string): number {
  const cat = ALIASES[category.toUpperCase()] ?? category.toUpperCase();
  const cc = country.toUpperCase();
  const market = RATES[cc] ?? RATES["*"];
  const rate = market[cat] ?? market["UTILITY"] ?? 0;
  return rate;
}

export function listSupportedCountries(): string[] {
  return Object.keys(RATES).filter((k) => k !== "*").sort();
}

export function getRateTable(): { country: string; rates: Record<string, number> }[] {
  return Object.entries(RATES)
    .filter(([k]) => k !== "*")
    .map(([country, rates]) => ({ country, rates }))
    .sort((a, b) => a.country.localeCompare(b.country));
}
