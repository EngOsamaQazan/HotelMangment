import type { Metadata, Viewport } from "next";
import { Tajawal, Amiri } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/components/AuthProvider";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
});

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  variable: "--font-amiri",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://hotel.aqssat.co";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "فندق المفرق — نظام الإدارة",
    template: "%s · فندق المفرق",
  },
  description: "نظام إدارة فندق المفرق",
  applicationName: "فندق المفرق",
  openGraph: {
    title: "فندق المفرق — نظام الإدارة",
    description: "نظام إدارة فندق المفرق",
    siteName: "فندق المفرق",
    url: SITE_URL,
    locale: "ar_JO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "فندق المفرق — نظام الإدارة",
    description: "نظام إدارة فندق المفرق",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0E3B33",
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
      <body className="font-[family-name:var(--font-tajawal)] antialiased">
        <AuthProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 md:mr-64 pt-16 md:pt-0 p-4 md:p-6 bg-page-bg min-h-screen">
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
