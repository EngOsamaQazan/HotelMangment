import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { parseIdFromSlug, buildUnitTypeSlug } from "@/lib/booking/slug";
import { SITE, SITE_URL, LOCALE } from "@/lib/seo/site";
import { publicPhotoUrl } from "@/lib/public-image";
import {
  hotelRoomJsonLd,
  breadcrumbsJsonLd,
  toJsonLdScript,
  type HotelRoomJsonLdInput,
} from "@/lib/seo/jsonld";

/**
 * Server-side SEO wrapper for `/book/type/[slug]`.
 *
 * The detail page itself is a client component (`"use client"`) so we
 * cannot attach `generateMetadata` directly to it. Instead we sit a
 * server `layout.tsx` in front of it:
 *   • builds per-type OpenGraph, Twitter card and canonical tags;
 *   • emits a rich `HotelRoom` + `BreadcrumbList` JSON-LD so Google
 *     can understand occupancy, size, price and link the page back to
 *     the parent Hotel entity.
 */

type Params = { slug: string };

async function loadUnitType(slug: string) {
  const id = parseIdFromSlug(slug);
  if (!id) return null;
  try {
    return await prisma.unitType.findFirst({
      where: { id, isActive: true, publiclyBookable: true },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        descriptionAr: true,
        descriptionEn: true,
        maxOccupancy: true,
        sizeSqm: true,
        hasKitchen: true,
        hasBalcony: true,
        basePriceDaily: true,
        photos: {
          select: {
            id: true,
            url: true,
            isPrimary: true,
          },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
          take: 6,
        },
        amenities: {
          select: {
            amenity: { select: { nameAr: true } },
          },
        },
      },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = await loadUnitType(slug);
  if (!t) {
    return {
      title: `${SITE.nameAr} — الغرف والأجنحة`,
      description: SITE.descriptionAr,
      alternates: { canonical: "/book" },
      robots: { index: false, follow: true },
    };
  }

  const canonical = `/book/type/${buildUnitTypeSlug(t.nameEn, t.code, t.id)}`;
  const title = `${t.nameAr} — حجز مباشر في ${SITE.nameAr}`;
  const desc =
    (t.descriptionAr?.trim() ||
      `${t.nameAr} في ${SITE.nameAr}: تتسع حتى ${t.maxOccupancy} ضيوف` +
        (t.sizeSqm ? `، مساحة ${t.sizeSqm}م²` : "") +
        (t.hasKitchen ? "، مطبخ حديث متكامل" : "") +
        (t.hasBalcony ? "، شرفة خاصّة" : "") +
        `. احجز مباشرة بأفضل الأسعار وتأكيد فوري.`).slice(0, 300);

  const primary =
    t.photos.find((p) => p.isPrimary) ?? t.photos[0] ?? null;
  const ogImage =
    (primary
      ? publicPhotoUrl("unit-type-photo", primary.id, primary.url)
      : null) || "/opengraph-image.png";

  return {
    title,
    description: desc,
    alternates: {
      canonical,
      languages: {
        "ar-JO": canonical,
        "x-default": canonical,
      },
    },
    openGraph: {
      type: "website",
      title,
      description: desc,
      url: `${SITE_URL}${canonical}`,
      locale: LOCALE.primary,
      siteName: SITE.nameAr,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: t.nameAr,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export default async function UnitTypeSeoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const t = await loadUnitType(slug);

  // Emit JSON-LD only when we can look up the type successfully — avoids
  // publishing structured data for unknown / stale slugs.
  const jsonLdParts: unknown[] = [];
  if (t) {
    const canonicalSlug = buildUnitTypeSlug(t.nameEn, t.code, t.id);
    const images = t.photos
      .slice(0, 6)
      .map((p) => publicPhotoUrl("unit-type-photo", p.id, p.url))
      .filter((u): u is string => !!u)
      // Force absolute URLs — schema.org strongly prefers them.
      .map((u) => new URL(u, SITE_URL).toString());
    const amenityNames = (t.amenities ?? [])
      .map((a) => a.amenity?.nameAr)
      .filter((n): n is string => !!n);

    const roomInput: HotelRoomJsonLdInput = {
      id: t.id,
      slug: canonicalSlug,
      nameAr: t.nameAr,
      nameEn: t.nameEn,
      description: t.descriptionAr,
      maxOccupancy: t.maxOccupancy,
      sizeSqm: t.sizeSqm,
      hasKitchen: t.hasKitchen,
      hasBalcony: t.hasBalcony,
      imageUrls: images,
      basePriceDaily: t.basePriceDaily ? Number(t.basePriceDaily) : null,
      amenities: amenityNames,
    };

    jsonLdParts.push(hotelRoomJsonLd(roomInput));
    jsonLdParts.push(
      breadcrumbsJsonLd([
        { name: SITE.nameAr, url: "/landing" },
        { name: "الحجز المباشر", url: "/book" },
        { name: t.nameAr, url: `/book/type/${canonicalSlug}` },
      ]),
    );
  }

  return (
    <>
      {jsonLdParts.map((d, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdScript(d as Record<string, unknown>),
          }}
        />
      ))}
      {children}
    </>
  );
}
