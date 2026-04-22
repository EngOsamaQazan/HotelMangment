import Link from "next/link";
import type { ReactNode } from "react";
import { Building2 } from "lucide-react";

/** Shared chrome for the public-facing marketing & legal pages.
 *  Intentionally simple: no sidebar, no auth, no client JS — so it renders
 *  identically for Meta reviewers, search engine crawlers, and customers. */
export function PublicLayout({
  children,
  activeHref,
}: {
  children: ReactNode;
  activeHref?: "/landing" | "/about" | "/privacy" | "/terms";
}) {
  const navItems: { href: "/landing" | "/about" | "/privacy" | "/terms"; label: string }[] = [
    { href: "/landing", label: "الرئيسية" },
    { href: "/about", label: "من نحن" },
    { href: "/privacy", label: "الخصوصية" },
    { href: "/terms", label: "الشروط" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-page-bg">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link
            href="/landing"
            className="flex items-center gap-2 font-bold text-lg hover:opacity-90"
          >
            <Building2 size={24} className="text-gold" />
            <span>فندق المفرق</span>
          </Link>

          <nav className="hidden md:flex items-center gap-5 text-sm">
            {navItems.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={
                  activeHref === n.href
                    ? "text-gold font-semibold"
                    : "text-white/90 hover:text-gold transition-colors"
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/login"
            className="px-4 py-2 rounded-lg bg-gold text-primary font-semibold hover:bg-gold-dark transition-colors text-sm"
          >
            تسجيل الدخول
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12">
        {children}
      </main>

      <footer className="border-t border-gold/20 bg-primary text-white/90 text-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="font-bold text-gold mb-1">فندق المفرق</p>
            <p className="text-white/70 text-xs leading-relaxed">
              المفرق — حي الزهور، خلف سكة حديد الحجاز، المملكة الأردنية الهاشمية.
            </p>
          </div>
          <div>
            <p className="font-semibold text-white mb-1">اتصل بنا</p>
            <p className="text-white/70 text-xs" dir="ltr">
              +962 78 109 9910
            </p>
            <p className="text-white/70 text-xs">info@mafhotel.com</p>
          </div>
          <div className="flex items-start md:items-end md:justify-end gap-4 text-xs">
            <Link href="/privacy" className="hover:text-gold">
              سياسة الخصوصية
            </Link>
            <Link href="/terms" className="hover:text-gold">
              شروط الاستخدام
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 text-center py-3 text-xs text-white/60">
          © {new Date().getFullYear()} فندق المفرق. جميع الحقوق محفوظة.
        </div>
      </footer>
    </div>
  );
}
