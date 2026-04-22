import type { Metadata } from "next";

// Guest account area is never public — block every crawler from
// touching any of its sub-routes, even if a stale link were to leak.
export const metadata: Metadata = {
  title: "حسابي",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
