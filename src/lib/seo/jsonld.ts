/**
 * Structured-data (JSON-LD) builders.
 *
 * بدل تكرار قوالب schema.org يدوياً عبر الصفحات، نبنيها هنا كوحدة
 * موحّدة. كل دالّة ترجع Object متوافقاً مع schema.org جاهزاً للحقن
 * داخل `<script type="application/ld+json">`.
 *
 * المراجع المعتمدة:
 *   - https://schema.org/Hotel
 *   - https://developers.google.com/search/docs/appearance/structured-data
 *   - https://developers.google.com/search/docs/appearance/structured-data/hotel
 */

import {
  ADDRESS,
  CONTACT,
  HOTEL_PROFILE,
  HOURS,
  SITE,
  SITE_URL,
  SOCIAL,
  absUrl,
} from "./site";

type JsonLd = Record<string, unknown>;

/** Short helper to filter out empty social URLs. */
function sameAsUrls(): string[] {
  const urls: string[] = [
    SOCIAL.facebook,
    SOCIAL.instagram,
    SOCIAL.tiktok,
    SOCIAL.x,
  ];
  return urls.filter((u) => Boolean(u));
}

/** Postal address block reused by every organisation/place schema. */
function postalAddress(): JsonLd {
  return {
    "@type": "PostalAddress",
    streetAddress: ADDRESS.streetAddressAr,
    addressLocality: ADDRESS.localityAr,
    addressRegion: ADDRESS.regionAr,
    postalCode: ADDRESS.postalCode,
    addressCountry: ADDRESS.countryCode,
  };
}

/** Geo coordinates block. */
function geo(): JsonLd {
  return {
    "@type": "GeoCoordinates",
    latitude: ADDRESS.latitude,
    longitude: ADDRESS.longitude,
  };
}

/** Organization — appears on every page so crawlers tie the brand together. */
export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE.nameAr,
    alternateName: SITE.nameEn,
    url: SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: absUrl("/logo.png"),
      width: 512,
      height: 512,
    },
    image: absUrl("/opengraph-image.png"),
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: CONTACT.phonePrimary,
        contactType: "reservations",
        areaServed: "JO",
        availableLanguage: ["Arabic", "English"],
      },
    ],
    sameAs: sameAsUrls(),
  };
}

/** WebSite — enables the site-links search box in Google results. */
export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: SITE.nameAr,
    alternateName: SITE.nameEn,
    inLanguage: "ar-JO",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/book?checkIn={checkin}&checkOut={checkout}&guests={guests}`,
      },
      "query-input": [
        "required name=checkin",
        "required name=checkout",
        "required name=guests",
      ],
    },
  };
}

/** LodgingBusiness / Hotel — the central entity. Rich, high-signal schema. */
export function hotelJsonLd(args?: {
  amenities?: string[];
  priceRange?: string;
  starRating?: number;
}): JsonLd {
  const amenities = (
    args?.amenities ?? [
      "واي فاي مجاني",
      "مطبخ حديث متكامل",
      "استقبال ٢٤ ساعة",
      "تدفئة مركزية",
      "تكييف",
      "مواقف سيارات",
      "تلفاز بشاشة مسطّحة",
      "لا يسمح بالتدخين",
    ]
  ).map((name) => ({
    "@type": "LocationFeatureSpecification",
    name,
  }));
  return {
    "@context": "https://schema.org",
    "@type": ["Hotel", "LocalBusiness"],
    "@id": `${SITE_URL}/#hotel`,
    name: SITE.nameAr,
    alternateName: SITE.nameEn,
    description: SITE.descriptionAr,
    url: SITE_URL,
    image: [absUrl("/logo.png"), absUrl("/brand-1.jpeg"), absUrl("/brand-2.jpeg")],
    logo: absUrl("/logo.png"),
    telephone: CONTACT.phonePrimary,
    email: CONTACT.email,
    priceRange: args?.priceRange ?? HOTEL_PROFILE.priceRange,
    currenciesAccepted: HOTEL_PROFILE.currency,
    paymentAccepted: "Cash, Credit Card",
    openingHours: HOURS.openingHours,
    address: postalAddress(),
    geo: geo(),
    numberOfRooms: HOTEL_PROFILE.numberOfRooms,
    starRating: {
      "@type": "Rating",
      ratingValue: args?.starRating ?? HOTEL_PROFILE.starRating,
    },
    amenityFeature: amenities,
    checkinTime: "14:00",
    checkoutTime: "12:00",
    petsAllowed: false,
    smokingAllowed: false,
    sameAs: sameAsUrls(),
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

/** BreadcrumbList — boosts SERP appearance with a structured trail. */
export function breadcrumbsJsonLd(
  items: Array<{ name: string; url: string }>,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absUrl(item.url),
    })),
  };
}

/** FAQPage — earns rich "People also ask"-style cards when eligible. */
export function faqJsonLd(
  faqs: Array<{ question: string; answer: string }>,
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export interface HotelRoomJsonLdInput {
  id: number;
  slug: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  maxOccupancy: number;
  sizeSqm?: number | null;
  hasKitchen?: boolean;
  hasBalcony?: boolean;
  imageUrls?: string[];
  basePriceDaily?: number | null;
  /** Amenities as plain Arabic strings (Wi-Fi, TV, etc.). */
  amenities?: string[];
}

/** HotelRoom — used on `/book/type/[slug]` detail pages. */
export function hotelRoomJsonLd(r: HotelRoomJsonLdInput): JsonLd {
  const url = absUrl(`/book/type/${r.slug}`);
  const amenities = (r.amenities ?? []).map((name) => ({
    "@type": "LocationFeatureSpecification",
    name,
  }));
  const images =
    r.imageUrls && r.imageUrls.length > 0
      ? r.imageUrls
      : [absUrl("/opengraph-image.png")];

  const schema: JsonLd = {
    "@context": "https://schema.org",
    "@type": "HotelRoom",
    "@id": `${url}#room`,
    url,
    name: r.nameAr,
    alternateName: r.nameEn ?? undefined,
    description:
      r.description?.trim() ||
      `${r.nameAr} في فندق المفرق — حتى ${r.maxOccupancy} ضيوف، جاهزة للحجز المباشر.`,
    image: images,
    occupancy: {
      "@type": "QuantitativeValue",
      maxValue: r.maxOccupancy,
      unitCode: "C62",
    },
    amenityFeature: amenities,
    containedInPlace: { "@id": `${SITE_URL}/#hotel` },
    isPartOf: { "@id": `${SITE_URL}/#hotel` },
  };

  if (r.sizeSqm && r.sizeSqm > 0) {
    schema.floorSize = {
      "@type": "QuantitativeValue",
      value: r.sizeSqm,
      unitCode: "MTK",
    };
  }

  if (r.basePriceDaily && r.basePriceDaily > 0) {
    // Make the offer look valid for the next 180 days — Google Hotels only
    // requires a plausible window, not an exact stock calendar.
    const priceValidUntil = new Date();
    priceValidUntil.setDate(priceValidUntil.getDate() + 180);
    schema.offers = {
      "@type": "Offer",
      url,
      priceCurrency: HOTEL_PROFILE.currency,
      price: r.basePriceDaily,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: r.basePriceDaily,
        priceCurrency: HOTEL_PROFILE.currency,
        unitCode: "DAY",
      },
      priceValidUntil: priceValidUntil.toISOString().slice(0, 10),
      availability: "https://schema.org/InStock",
    };
  }

  return schema;
}

/** Convenience helper: stringify and pretty-escape for `dangerouslySetInnerHTML`. */
export function toJsonLdScript(data: JsonLd | JsonLd[]): string {
  // Single-line, XSS-safe stringify — ensure `</script>` inside values can't break out.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
