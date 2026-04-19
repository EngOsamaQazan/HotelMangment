import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/components/AuthProvider";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800", "900"],
  variable: "--font-tajawal",
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "فندق الفاخر — نظام الإدارة",
  description: "نظام إدارة فندق الفاخر — المملكة الأردنية الهاشمية",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#1e293b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable}>
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
