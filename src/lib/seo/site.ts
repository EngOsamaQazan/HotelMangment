/**
 * Central SEO constants and helpers.
 *
 * تجمع هذه الوحدة كل ثوابت تحسين محركات البحث (SEO) في مكان واحد —
 * العنوان والوصف والكلمات المفتاحية وبيانات الموقع الجغرافي وروابط
 * التواصل الاجتماعي — بحيث يكون أي تعديل للعلامة التجارية أو للعنوان
 * يتمّ من نقطة مركزية واحدة بدلاً من البحث عنه في عشرات الصفحات.
 *
 * كلّ ما هنا يُستعمل من مكانين فقط:
 *   1. `src/app/layout.tsx` — كـ fallback افتراضي لكل الصفحات.
 *   2. مُنشئ JSON-LD في `src/lib/seo/jsonld.ts`.
 */

export const SITE_URL: string = (() => {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.NODE_ENV === "production"
      ? "https://mafhotel.com"
      : "http://localhost:3000");
  return envUrl.replace(/\/+$/, "");
})();

/** Absolute URL helper — guarantees a valid fully-qualified URL. */
export function absUrl(path = "/"): string {
  if (!path) return SITE_URL;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The primary site identity used in metadata and JSON-LD. */
export const SITE = {
  /** Canonical brand name — Arabic. */
  nameAr: "فندق المفرق",
  /** Canonical brand name — English transliteration (search indices pick both). */
  nameEn: "Mafraq Hotel",
  /** Short slogan used after the name in titles. */
  sloganAr: "أفخم إقامة",
  sloganEn: "Luxury stays in Al Mafraq",
  /** Rich 150–160 char description tuned for Google SERPs. */
  descriptionAr:
    "فندق المفرق — أفخم إقامة في مدينة المفرق، الأردن. غرف وشقق فندقية فاخرة، كل وحدة بمطبخ حديث متكامل، واي فاي مجاني، خدمة استقبال ٢٤/٧، مواقف سيارات، قرب الدوائر الحكومية والمراكز الرئيسية.",
  descriptionEn:
    "Mafraq Hotel — the finest stays in Al Mafraq, Jordan. Fully-equipped hotel rooms and apartments with modern kitchens, free Wi-Fi, 24/7 reception, parking, minutes away from government offices and city center.",
  /** Key search phrases we want to rank for. */
  keywordsAr: [
    "فندق المفرق",
    "فندق في المفرق",
    "أفخم فنادق المفرق",
    "فنادق المفرق الأردن",
    "شقق فندقية المفرق",
    "غرف فندقية المفرق",
    "حجز فندق المفرق",
    "حي الزهور المفرق",
    "سكن المفرق",
    "إقامة عائلية المفرق",
  ],
  keywordsEn: [
    "Mafraq hotel",
    "Al Mafraq hotel",
    "hotels in Mafraq",
    "Mafraq Jordan hotel",
    "hotel apartments Mafraq",
    "family suite Mafraq",
    "book Mafraq hotel",
    "Zuhour district Mafraq",
  ],
} as const;

/** Physical address in a machine-readable structure (also feeds schema.org). */
export const ADDRESS = {
  streetAddressAr: "حي الزهور",
  streetAddressEn: "Zuhour District",
  localityAr: "المفرق",
  localityEn: "Al Mafraq",
  regionAr: "محافظة المفرق",
  regionEn: "Mafraq Governorate",
  postalCode: "25110",
  countryCode: "JO",
  /** Approximate WGS-84 coordinates of the Zuhour district centre. */
  latitude: 32.3422,
  longitude: 36.2088,
} as const;

/** Public contact channels — shown in meta, JSON-LD and footer. */
export const CONTACT = {
  phonePrimary: "+962781099910",
  whatsapp: "+962781099910",
  email: "info@mafhotel.com",
} as const;

/** Opening / reception hours — schema.org compatible. */
export const HOURS = {
  // 24/7 front desk. `Mo-Su 00:00-23:59` is recognised as continuous.
  openingHours: "Mo,Tu,We,Th,Fr,Sa,Su 00:00-23:59",
} as const;

/** Hotel class / price-range hint for Google Travel. `$$` ≈ mid-budget family. */
export const HOTEL_PROFILE = {
  priceRange: "$$",
  starRating: 3,
  /** Number of physical rooms / units advertised to search engines. */
  numberOfRooms: 15,
  /** ISO 4217 currency used across all rate displays. */
  currency: "JOD",
} as const;

/** Social handles — used in JSON-LD `sameAs`. Leave empty strings if unused. */
export const SOCIAL = {
  facebook: "https://www.facebook.com/mafhotel",
  instagram: "https://www.instagram.com/mafhotel",
  whatsappLink: "https://wa.me/962781099910",
  tiktok: "",
  x: "",
} as const;

/** Locale strings for hreflang / OpenGraph. */
export const LOCALE = {
  primary: "ar_JO",
  alternate: "en_JO",
} as const;

/** Google Search Console / Bing Webmaster verification tokens.
 *  Ship empty strings in the repo — set the real values via env on production. */
export const VERIFICATION = {
  google: process.env.NEXT_PUBLIC_GSC_VERIFICATION?.trim() || "",
  bing: process.env.NEXT_PUBLIC_BING_VERIFICATION?.trim() || "",
  yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION?.trim() || "",
} as const;
