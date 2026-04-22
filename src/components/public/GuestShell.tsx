"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";

/**
 * Chrome for guest-facing pages: /signin, /signup, /book/*, /account/*.
 *
 * Keep it narrow and fast — no admin sidebar, no permission gate. The
 * header adapts to the session (sign-in link vs. "حسابي" menu) so guests
 * always know their auth state.
 */
export function GuestShell({
  children,
  active,
  fullBleed = false,
  lightHeader = false,
}: {
  children: ReactNode;
  active?: "book" | "account" | "auth";
  fullBleed?: boolean;
  lightHeader?: boolean;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isGuest = session?.user?.audience === "guest";

  const navItems: { href: string; label: string; key: "book" | "account" }[] = [
    { href: "/book", label: "احجز الآن", key: "book" },
    { href: "/account", label: "حجوزاتي", key: "account" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-page-bg">
      <header
        className={
          lightHeader
            ? "bg-white border-b border-gray-200"
            : "bg-primary text-white shadow-md"
        }
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 md:py-4 flex items-center justify-between gap-4">
          <Link
            href="/landing"
            className={
              lightHeader
                ? "flex items-center gap-2 text-primary hover:opacity-90"
                : "flex items-center gap-2 text-white hover:opacity-90"
            }
          >
            <span className="relative h-10 w-10 md:h-11 md:w-11 shrink-0">
              <Image
                src="/logo.png"
                alt="فندق المفرق"
                fill
                sizes="44px"
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
                  active === n.key
                    ? lightHeader
                      ? "text-primary font-semibold"
                      : "text-gold font-semibold"
                    : lightHeader
                      ? "text-gray-600 hover:text-primary"
                      : "text-white/90 hover:text-gold transition-colors"
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {isGuest ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/account"
                  className={
                    lightHeader
                      ? "text-xs sm:text-sm text-gray-700 hover:text-primary font-medium"
                      : "text-xs sm:text-sm text-white/90 hover:text-gold font-medium"
                  }
                >
                  {session.user.name?.split(" ")[0] ?? "حسابي"}
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    signOut({ callbackUrl: "/landing", redirect: true })
                  }
                  className={
                    lightHeader
                      ? "px-3 py-1.5 rounded-lg border border-gray-300 text-xs text-gray-600 hover:bg-gray-50"
                      : "px-3 py-1.5 rounded-lg border border-white/30 text-xs text-white hover:bg-white/10"
                  }
                >
                  خروج
                </button>
              </div>
            ) : (
              <Link
                href={{
                  pathname: "/signin",
                  query:
                    pathname && pathname !== "/" && pathname !== "/signin"
                      ? { next: pathname }
                      : undefined,
                }}
                className="px-3 sm:px-4 py-2 rounded-lg bg-gold text-primary font-semibold hover:bg-gold-dark transition-colors text-xs sm:text-sm shadow-sm"
              >
                تسجيل الدخول
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        className={
          fullBleed
            ? "flex-1"
            : "flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 md:py-10"
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
