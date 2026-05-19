/**
 * Detect the guest's country and preferred language from their E.164 phone
 * number. Uses the international dialing prefix (country calling code) which
 * is already present after normalisation.
 *
 * The mapping covers all countries with meaningful tourism traffic to Jordan
 * plus the top 50 WhatsApp markets worldwide. When a prefix doesn't match,
 * we fall back to English — the safest lingua franca for hospitality.
 */

export type BotLanguage =
  | "ar"   // Arabic
  | "en"   // English
  | "fr"   // French
  | "de"   // German
  | "es"   // Spanish
  | "it"   // Italian
  | "pt"   // Portuguese
  | "ru"   // Russian
  | "zh"   // Chinese (Simplified)
  | "ja"   // Japanese
  | "ko"   // Korean
  | "tr"   // Turkish
  | "hi"   // Hindi
  | "nl"   // Dutch
  | "pl"   // Polish
  | "uk"   // Ukrainian
  | "fa"   // Persian/Farsi
  | "he"   // Hebrew
  | "id"   // Indonesian/Malay
  | "th"   // Thai
  | "sv"   // Swedish
  | "ro"   // Romanian
  | "el"   // Greek
  | "cs"   // Czech
  | "hu"   // Hungarian;

export interface PhoneOrigin {
  /** ISO 3166-1 alpha-2 country code (uppercase). */
  countryCode: string;
  /** Country name in English — used only for logging/analytics, never shown. */
  countryName: string;
  /** Best-guess conversational language for this country. */
  language: BotLanguage;
  /** Human-readable language name in the language itself (for prompt). */
  languageNativeName: string;
}

interface PrefixEntry {
  prefix: string;
  cc: string;
  name: string;
  lang: BotLanguage;
  nativeName: string;
}

const PREFIXES: PrefixEntry[] = [
  // ── Arab world ──
  { prefix: "962",  cc: "JO", name: "Jordan",           lang: "ar", nativeName: "العربية" },
  { prefix: "966",  cc: "SA", name: "Saudi Arabia",      lang: "ar", nativeName: "العربية" },
  { prefix: "971",  cc: "AE", name: "UAE",               lang: "ar", nativeName: "العربية" },
  { prefix: "965",  cc: "KW", name: "Kuwait",            lang: "ar", nativeName: "العربية" },
  { prefix: "968",  cc: "OM", name: "Oman",              lang: "ar", nativeName: "العربية" },
  { prefix: "974",  cc: "QA", name: "Qatar",             lang: "ar", nativeName: "العربية" },
  { prefix: "973",  cc: "BH", name: "Bahrain",           lang: "ar", nativeName: "العربية" },
  { prefix: "964",  cc: "IQ", name: "Iraq",              lang: "ar", nativeName: "العربية" },
  { prefix: "963",  cc: "SY", name: "Syria",             lang: "ar", nativeName: "العربية" },
  { prefix: "961",  cc: "LB", name: "Lebanon",           lang: "ar", nativeName: "العربية" },
  { prefix: "970",  cc: "PS", name: "Palestine",         lang: "ar", nativeName: "العربية" },
  { prefix: "967",  cc: "YE", name: "Yemen",             lang: "ar", nativeName: "العربية" },
  { prefix: "20",   cc: "EG", name: "Egypt",             lang: "ar", nativeName: "العربية" },
  { prefix: "218",  cc: "LY", name: "Libya",             lang: "ar", nativeName: "العربية" },
  { prefix: "216",  cc: "TN", name: "Tunisia",           lang: "ar", nativeName: "العربية" },
  { prefix: "213",  cc: "DZ", name: "Algeria",           lang: "ar", nativeName: "العربية" },
  { prefix: "212",  cc: "MA", name: "Morocco",           lang: "ar", nativeName: "العربية" },
  { prefix: "249",  cc: "SD", name: "Sudan",             lang: "ar", nativeName: "العربية" },
  { prefix: "252",  cc: "SO", name: "Somalia",           lang: "ar", nativeName: "العربية" },
  { prefix: "253",  cc: "DJ", name: "Djibouti",          lang: "ar", nativeName: "العربية" },
  { prefix: "222",  cc: "MR", name: "Mauritania",        lang: "ar", nativeName: "العربية" },
  { prefix: "269",  cc: "KM", name: "Comoros",           lang: "ar", nativeName: "العربية" },

  // ── English-speaking ──
  { prefix: "1",    cc: "US", name: "USA/Canada",        lang: "en", nativeName: "English" },
  { prefix: "44",   cc: "GB", name: "United Kingdom",    lang: "en", nativeName: "English" },
  { prefix: "61",   cc: "AU", name: "Australia",         lang: "en", nativeName: "English" },
  { prefix: "64",   cc: "NZ", name: "New Zealand",       lang: "en", nativeName: "English" },
  { prefix: "353",  cc: "IE", name: "Ireland",           lang: "en", nativeName: "English" },
  { prefix: "27",   cc: "ZA", name: "South Africa",      lang: "en", nativeName: "English" },
  { prefix: "254",  cc: "KE", name: "Kenya",             lang: "en", nativeName: "English" },
  { prefix: "234",  cc: "NG", name: "Nigeria",           lang: "en", nativeName: "English" },
  { prefix: "233",  cc: "GH", name: "Ghana",             lang: "en", nativeName: "English" },
  { prefix: "256",  cc: "UG", name: "Uganda",            lang: "en", nativeName: "English" },
  { prefix: "255",  cc: "TZ", name: "Tanzania",          lang: "en", nativeName: "English" },
  { prefix: "63",   cc: "PH", name: "Philippines",       lang: "en", nativeName: "English" },
  { prefix: "65",   cc: "SG", name: "Singapore",         lang: "en", nativeName: "English" },
  { prefix: "356",  cc: "MT", name: "Malta",             lang: "en", nativeName: "English" },
  { prefix: "357",  cc: "CY", name: "Cyprus",            lang: "en", nativeName: "English" },

  // ── French-speaking ──
  { prefix: "33",   cc: "FR", name: "France",            lang: "fr", nativeName: "Français" },
  { prefix: "32",   cc: "BE", name: "Belgium",           lang: "fr", nativeName: "Français" },
  { prefix: "41",   cc: "CH", name: "Switzerland",       lang: "fr", nativeName: "Français" },
  { prefix: "352",  cc: "LU", name: "Luxembourg",        lang: "fr", nativeName: "Français" },
  { prefix: "221",  cc: "SN", name: "Senegal",           lang: "fr", nativeName: "Français" },
  { prefix: "225",  cc: "CI", name: "Côte d'Ivoire",     lang: "fr", nativeName: "Français" },
  { prefix: "237",  cc: "CM", name: "Cameroon",          lang: "fr", nativeName: "Français" },

  // ── German-speaking ──
  { prefix: "49",   cc: "DE", name: "Germany",           lang: "de", nativeName: "Deutsch" },
  { prefix: "43",   cc: "AT", name: "Austria",           lang: "de", nativeName: "Deutsch" },

  // ── Spanish-speaking ──
  { prefix: "34",   cc: "ES", name: "Spain",             lang: "es", nativeName: "Español" },
  { prefix: "52",   cc: "MX", name: "Mexico",            lang: "es", nativeName: "Español" },
  { prefix: "54",   cc: "AR", name: "Argentina",         lang: "es", nativeName: "Español" },
  { prefix: "57",   cc: "CO", name: "Colombia",          lang: "es", nativeName: "Español" },
  { prefix: "56",   cc: "CL", name: "Chile",             lang: "es", nativeName: "Español" },
  { prefix: "51",   cc: "PE", name: "Peru",              lang: "es", nativeName: "Español" },

  // ── Italian ──
  { prefix: "39",   cc: "IT", name: "Italy",             lang: "it", nativeName: "Italiano" },

  // ── Portuguese-speaking ──
  { prefix: "351",  cc: "PT", name: "Portugal",          lang: "pt", nativeName: "Português" },
  { prefix: "55",   cc: "BR", name: "Brazil",            lang: "pt", nativeName: "Português" },

  // ── Russian-speaking ──
  { prefix: "7",    cc: "RU", name: "Russia",            lang: "ru", nativeName: "Русский" },
  { prefix: "375",  cc: "BY", name: "Belarus",           lang: "ru", nativeName: "Русский" },
  { prefix: "77",   cc: "KZ", name: "Kazakhstan",        lang: "ru", nativeName: "Русский" },

  // ── Ukrainian ──
  { prefix: "380",  cc: "UA", name: "Ukraine",           lang: "uk", nativeName: "Українська" },

  // ── Turkish ──
  { prefix: "90",   cc: "TR", name: "Turkey",            lang: "tr", nativeName: "Türkçe" },

  // ── Persian / Farsi ──
  { prefix: "98",   cc: "IR", name: "Iran",              lang: "fa", nativeName: "فارسی" },
  { prefix: "93",   cc: "AF", name: "Afghanistan",       lang: "fa", nativeName: "فارسی" },

  // ── Hebrew ──
  { prefix: "972",  cc: "IL", name: "Israel",            lang: "he", nativeName: "עברית" },

  // ── Hindi ──
  { prefix: "91",   cc: "IN", name: "India",             lang: "hi", nativeName: "हिन्दी" },
  { prefix: "977",  cc: "NP", name: "Nepal",             lang: "hi", nativeName: "हिन्दी" },

  // ── Chinese ──
  { prefix: "86",   cc: "CN", name: "China",             lang: "zh", nativeName: "中文" },
  { prefix: "852",  cc: "HK", name: "Hong Kong",         lang: "zh", nativeName: "中文" },
  { prefix: "853",  cc: "MO", name: "Macau",             lang: "zh", nativeName: "中文" },
  { prefix: "886",  cc: "TW", name: "Taiwan",            lang: "zh", nativeName: "中文" },

  // ── Japanese ──
  { prefix: "81",   cc: "JP", name: "Japan",             lang: "ja", nativeName: "日本語" },

  // ── Korean ──
  { prefix: "82",   cc: "KR", name: "South Korea",       lang: "ko", nativeName: "한국어" },

  // ── Dutch ──
  { prefix: "31",   cc: "NL", name: "Netherlands",       lang: "nl", nativeName: "Nederlands" },

  // ── Polish ──
  { prefix: "48",   cc: "PL", name: "Poland",            lang: "pl", nativeName: "Polski" },

  // ── Indonesian / Malay ──
  { prefix: "62",   cc: "ID", name: "Indonesia",         lang: "id", nativeName: "Bahasa Indonesia" },
  { prefix: "60",   cc: "MY", name: "Malaysia",          lang: "id", nativeName: "Bahasa Melayu" },

  // ── Thai ──
  { prefix: "66",   cc: "TH", name: "Thailand",          lang: "th", nativeName: "ไทย" },

  // ── Swedish ──
  { prefix: "46",   cc: "SE", name: "Sweden",            lang: "sv", nativeName: "Svenska" },

  // ── Romanian ──
  { prefix: "40",   cc: "RO", name: "Romania",           lang: "ro", nativeName: "Română" },

  // ── Greek ──
  { prefix: "30",   cc: "GR", name: "Greece",            lang: "el", nativeName: "Ελληνικά" },

  // ── Czech ──
  { prefix: "420",  cc: "CZ", name: "Czech Republic",    lang: "cs", nativeName: "Čeština" },

  // ── Hungarian ──
  { prefix: "36",   cc: "HU", name: "Hungary",           lang: "hu", nativeName: "Magyar" },

  // ── Pakistani (Urdu → we serve in English since Urdu isn't in the LLM's strong suits for hospitality) ──
  { prefix: "92",   cc: "PK", name: "Pakistan",          lang: "en", nativeName: "English" },
  // ── Sri Lanka ──
  { prefix: "94",   cc: "LK", name: "Sri Lanka",         lang: "en", nativeName: "English" },
  // ── Bangladesh ──
  { prefix: "880",  cc: "BD", name: "Bangladesh",        lang: "en", nativeName: "English" },
  // ── Ethiopia ──
  { prefix: "251",  cc: "ET", name: "Ethiopia",          lang: "en", nativeName: "English" },
];

// Sort longest prefix first so "972" matches before "97" and "77" matches before "7".
const SORTED_PREFIXES = [...PREFIXES].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

const DEFAULT_ORIGIN: PhoneOrigin = {
  countryCode: "XX",
  countryName: "Unknown",
  language: "en",
  languageNativeName: "English",
};

/**
 * Detect country + language from an E.164 phone number (digits only, no "+").
 * Returns the best match or a safe English fallback.
 */
export function detectPhoneOrigin(phone: string | null | undefined): PhoneOrigin {
  if (!phone) return DEFAULT_ORIGIN;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return DEFAULT_ORIGIN;

  for (const entry of SORTED_PREFIXES) {
    if (digits.startsWith(entry.prefix)) {
      return {
        countryCode: entry.cc,
        countryName: entry.name,
        language: entry.lang,
        languageNativeName: entry.nativeName,
      };
    }
  }

  return DEFAULT_ORIGIN;
}

/**
 * Native display name for a BotLanguage code. Used in the system prompt so
 * the LLM knows which language to reply in, phrased in that language itself.
 */
export const LANGUAGE_NAMES: Record<BotLanguage, string> = {
  ar: "العربية",
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  tr: "Türkçe",
  hi: "हिन्दी",
  nl: "Nederlands",
  pl: "Polski",
  uk: "Українська",
  fa: "فارسی",
  he: "עברית",
  id: "Bahasa Indonesia",
  th: "ไทย",
  sv: "Svenska",
  ro: "Română",
  el: "Ελληνικά",
  cs: "Čeština",
  hu: "Magyar",
};
