import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

/** Shared chrome for the public-facing marketing & legal pages.
 *  Intentionally simple: no sidebar, no auth, no client JS — so it renders
 *  identically for Meta reviewers, search engine crawlers, and customers. */
export function PublicLayout({
  children,
  activeHref,
  transparentHeader = false,
  fullBleed = false,
}: {
  children: ReactNode;
  activeHref?: "/landing" | "/about" | "/privacy" | "/terms";
  /** When true the header floats over the hero (used on /landing). */
  transparentHeader?: boolean;
  /** When true, <main> won't apply its padded container — let the page
   *  build its own edge-to-edge sections (hero, full-bleed galleries). */
  fullBleed?: boolean;
}) {
  const navItems: { href: "/landing" | "/about" | "/privacy" | "/terms"; label: string }[] = [
    { href: "/landing", label: "الرئيسية" },
    { href: "/about", label: "من نحن" },
    { href: "/privacy", label: "الخصوصية" },
    { href: "/terms", label: "الشروط" },
  ];

  const headerClass = transparentHeader
    ? "absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/55 to-transparent text-white"
    : "bg-primary text-white shadow-md";

  return (
    <div className="min-h-screen flex flex-col bg-page-bg">
      <header className={headerClass}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 md:py-4 flex items-center justify-between gap-4">
          <Link
            href="/landing"
            className="flex items-center gap-2 hover:opacity-90"
          >
            <span className="relative h-10 w-10 md:h-12 md:w-12 shrink-0">
              <Image
                src="/logo.png"
                alt="فندق المفرق"
                fill
                sizes="48px"
                className="object-contain"
                priority
              />
            </span>
            <span className="font-bold text-base md:text-lg tracking-wide">
              فندق المفرق
            </span>
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
            className="px-3 sm:px-4 py-2 rounded-lg bg-gold text-primary font-semibold hover:bg-gold-dark transition-colors text-xs sm:text-sm"
          >
            تسجيل الدخول
          </Link>
        </div>
      </header>

      <main
        className={
          fullBleed
            ? "flex-1"
            : "flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 md:py-12"
        }
      >
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
