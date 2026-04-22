import type { Metadata } from "next";
import { SITE, SITE_URL, LOCALE } from "@/lib/seo/site";
import {
  hotelJsonLd,
  breadcrumbsJsonLd,
  toJsonLdScript,
} from "@/lib/seo/jsonld";

const bookTitle = `احجز مباشرة — ${SITE.nameAr}`;
const bookDescription = `احجز إقامتك في ${SITE.nameAr} مباشرة من الموقع الرسمي — أفضل الأسعار، تأكيد فوري عبر واتساب، دفع عند الوصول، ${SITE.descriptionAr.slice(0, 80)}`;

export const metadata: Metadata = {
  title: bookTitle,
  description: bookDescription,
  alternates: {
    canonical: "/book",
    languages: {
      "ar-JO": "/book",
      "x-default": "/book",
    },
  },
  openGraph: {
    type: "website",
    title: bookTitle,
    description: bookDescription,
    url: `${SITE_URL}/book`,
    locale: LOCALE.primary,
    siteName: SITE.nameAr,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: bookTitle,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: bookTitle,
    description: bookDescription,
    images: ["/opengraph-image.png"],
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

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const breadcrumbs = breadcrumbsJsonLd([
    { name: SITE.nameAr, url: "/landing" },
    { name: "الحجز المباشر", url: "/book" },
  ]);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(hotelJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(breadcrumbs) }}
      />
      {children}
    </>
  );
}
