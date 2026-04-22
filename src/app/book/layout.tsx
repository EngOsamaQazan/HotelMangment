import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "احجز مباشرة | فندق فاخر",
  description:
    "احجز إقامتك في فندق فاخر مباشرة من موقعنا الرسمي — أفضل الأسعار، تأكيد فوري عبر واتساب، وتجربة حجز سهلة وآمنة.",
  openGraph: {
    type: "website",
    title: "احجز مباشرة | فندق فاخر",
    description:
      "احجز إقامتك في فندق فاخر مباشرة من موقعنا الرسمي — أفضل الأسعار وتأكيد فوري.",
    locale: "ar_JO",
    siteName: "فندق فاخر",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Hotel",
            name: "فندق فاخر",
            url: "https://mafhotel.com/book",
            telephone: "+962781099910",
            address: {
              "@type": "PostalAddress",
              addressLocality: "عمّان",
              addressCountry: "JO",
            },
            amenityFeature: [
              { "@type": "LocationFeatureSpecification", name: "Wi-Fi مجاني" },
              {
                "@type": "LocationFeatureSpecification",
                name: "خدمة 24 ساعة",
              },
              {
                "@type": "LocationFeatureSpecification",
                name: "مواقف سيارات",
              },
            ],
          }),
        }}
      />
      {children}
    </>
  );
}
