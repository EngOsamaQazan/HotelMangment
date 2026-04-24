import type { Metadata, Viewport } from "next";
import { Tajawal, Amiri } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/components/AuthProvider";
import { BFCacheBuster } from "@/components/BFCacheBuster";
import { PermissionsProvider } from "@/lib/permissions/client";
import { RealtimeProvider } from "@/lib/realtime/client";
import { Toaster } from "sonner";
import {
  SITE,
  SITE_URL,
  LOCALE,
  VERIFICATION,
  CONTACT,
} from "@/lib/seo/site";
import {
  organizationJsonLd,
  websiteJsonLd,
  toJsonLdScript,
} from "@/lib/seo/jsonld";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const defaultTitle = `${SITE.nameAr} — ${SITE.sloganAr}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: defaultTitle,
    template: `%s · ${SITE.nameAr}`,
  },
  description: SITE.descriptionAr,
  applicationName: SITE.nameAr,
  generator: "Next.js",
  referrer: "origin-when-cross-origin",
  keywords: [...SITE.keywordsAr, ...SITE.keywordsEn],
  authors: [{ name: SITE.nameAr, url: SITE_URL }],
  creator: SITE.nameAr,
  publisher: SITE.nameAr,
  category: "travel",
  formatDetection: {
    email: true,
    address: true,
    telephone: true,
  },
  alternates: {
    canonical: "/",
    languages: {
      "ar-JO": "/",
      "x-default": "/",
    },
  },
  openGraph: {
    title: defaultTitle,
    description: SITE.descriptionAr,
    siteName: SITE.nameAr,
    url: SITE_URL,
    locale: LOCALE.primary,
    alternateLocale: [LOCALE.alternate],
    type: "website",
    countryName: "Jordan",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE.nameAr} — ${SITE.sloganAr}`,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: SITE.descriptionAr,
    images: ["/opengraph-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-icon.png", type: "image/png", sizes: "180x180" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: "/icon.png" }],
  },
  manifest: "/manifest.webmanifest",
  verification: {
    google: VERIFICATION.google || undefined,
    yandex: VERIFICATION.yandex || undefined,
    other: VERIFICATION.bing
      ? { "msvalidate.01": VERIFICATION.bing }
      : undefined,
  },
  other: {
    "geo.region": "JO-MA",
    "geo.placename": "Al Mafraq",
    "geo.position": "32.3422;36.2088",
    ICBM: "32.3422, 36.2088",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0E3B33" },
    { media: "(prefers-color-scheme: dark)", color: "#0E3B33" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${tajawal.variable} ${amiri.variable}`}
    >
      <head>
        {/* Performance hints: resolve third-party hosts before render. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        {/* Structured data that applies to every page on the domain. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLdScript(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLdScript(websiteJsonLd()) }}
        />
        {/* Machine-readable contact hint for SERP "call" actions. */}
        <meta name="contact" content={CONTACT.email} />
      </head>
      <body className="font-[family-name:var(--font-tajawal)] antialiased">
        <AuthProvider>
          <PermissionsProvider>
            <RealtimeProvider>
              <BFCacheBuster />
              <AppShell>{children}</AppShell>
              <Toaster
                position="top-center"
                richColors
                dir="rtl"
                toastOptions={{
                  style: {
                    fontFamily: "var(--font-tajawal)",
                  },
                }}
              />
            </RealtimeProvider>
          </PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
