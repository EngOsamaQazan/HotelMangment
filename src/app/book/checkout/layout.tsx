import type { Metadata } from "next";

// Checkout is a private, per-session flow — never let search engines
// index it. The Hotel JSON-LD from the parent `/book` layout still
// renders for any stray visitor (it's harmless in this context).
export const metadata: Metadata = {
  title: "إتمام الحجز",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: "/book" },
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
