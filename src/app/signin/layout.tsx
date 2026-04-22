import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
