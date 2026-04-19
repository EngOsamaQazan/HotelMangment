"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  BedDouble,
  Users,
  Wallet,
  Wrench,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Calculator,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { BrandLogo, BrandLogoInline } from "@/components/BrandLogo";

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/reservations", label: "الحجوزات", icon: CalendarCheck },
  { href: "/rooms", label: "حالة الغرف", icon: BedDouble },
  { href: "/guests", label: "النزلاء", icon: Users },
  { href: "/finance", label: "الصندوق والبنك", icon: Wallet },
  { href: "/accounting", label: "المحاسبة", icon: Calculator },
  { href: "/maintenance", label: "الصيانة", icon: Wrench },
  { href: "/reports/monthly", label: "التقرير الشهري", icon: BarChart3 },
  { href: "/reports/debts", label: "تقرير الديون", icon: FileText },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    closeMobile();
  }, [pathname, closeMobile]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  if (pathname === "/login") return null;

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="fixed top-0 right-0 left-0 h-14 bg-sidebar text-white flex items-center justify-between px-4 z-50 md:hidden no-print safe-bottom border-b border-gold/30">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-sidebar-hover transition-colors"
          aria-label="فتح القائمة"
        >
          <Menu size={24} />
        </button>
        <BrandLogoInline />
        <div className="w-10" />
      </div>

      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] md:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 h-screen w-64 bg-sidebar text-white flex flex-col z-[70] no-print transition-transform duration-300 ease-in-out",
          "border-l border-gold/20",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}
      >
        <div className="px-5 pt-6 pb-5 border-b border-gold/20 flex items-start justify-between md:justify-center">
          <div className="flex-1 flex justify-center">
            <BrandLogo size="md" />
          </div>
          <button
            onClick={closeMobile}
            className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-colors md:hidden text-gold"
            aria-label="إغلاق القائمة"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-[11px] text-gold/70 text-center pt-2 pb-1 hidden md:block tracking-wider">
          نظام الإدارة المتكامل
        </p>

        <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-5 py-3 text-sm transition-colors relative",
                  isActive
                    ? "bg-primary-dark text-gold font-bold border-r-[3px] border-gold"
                    : "text-white/80 hover:bg-sidebar-hover hover:text-gold-light"
                )}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gold/20 safe-bottom">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-3 px-5 py-2 text-sm text-white/70 hover:text-red-300 transition-colors w-full"
          >
            <LogOut size={18} />
            <span>تسجيل خروج</span>
          </button>
        </div>
      </aside>
    </>
  );
}
