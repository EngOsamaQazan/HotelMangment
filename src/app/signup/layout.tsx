import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "إنشاء حساب ضيف",
  robots: {
    index: false,
    follow: true,
    googleBot: { index: false, follow: true },
  },
};

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
