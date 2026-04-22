"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  BedDouble,
  Users,
  Wrench,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Calculator,
  ChevronDown,
  KanbanSquare,
  MessageSquare,
  MessageCircle,
  Users2,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { BrandLogo, BrandLogoInline } from "@/components/BrandLogo";
import { usePermissions } from "@/lib/permissions/client";
import { NotificationsBell } from "@/components/NotificationsBell";
import { UserMenu } from "@/components/UserMenu";
import {
  useRealtimeEvent,
  type ChatEventPayload,
  type ChatReadPayload,
} from "@/lib/realtime/client";
import { useSession } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Required permission key — user needs at least one to see the item. */
  permission: string | string[];
  /** Optional key used by the sidebar to attach a dynamic badge count. */
  badgeKey?: "chatUnread";
}

interface NavGroup {
  id: string;
  label?: string;
  icon?: typeof LayoutDashboard;
  items: NavItem[];
  /** If true, group renders without a collapsible header (flat). */
  flat?: boolean;
}

const navGroups: NavGroup[] = [
  {
    id: "primary",
    flat: true,
    items: [
      { href: "/", label: "لوحة التحكم", icon: LayoutDashboard, permission: "dashboard:view" },
      { href: "/reservations", label: "الحجوزات", icon: CalendarCheck, permission: "reservations:view" },
      { href: "/rooms", label: "حالة الغرف", icon: BedDouble, permission: "rooms:view" },
      { href: "/guests", label: "الضيوف", icon: Users, permission: "guests:view" },
      { href: "/accounting", label: "المحاسبة", icon: Calculator, permission: "accounting:view" },
      { href: "/maintenance", label: "الصيانة", icon: Wrench, permission: "maintenance:view" },
    ],
  },
  {
    id: "collab",
    label: "التعاون",
    icon: Users2,
    items: [
      { href: "/tasks", label: "المهام", icon: KanbanSquare, permission: "tasks.boards:view" },
      {
        href: "/chat",
        label: "المحادثات",
        icon: MessageSquare,
        permission: "chat:view",
        badgeKey: "chatUnread",
      },
      {
        href: "/whatsapp",
        label: "واتساب",
        icon: MessageCircle,
        permission: "whatsapp:view",
      },
    ],
  },
  {
    id: "reports",
    flat: true,
    items: [
      { href: "/reports/monthly", label: "التقرير الشهري", icon: BarChart3, permission: "reports.monthly:view" },
      { href: "/settings", label: "الإعدادات", icon: Settings, permission: "settings:view" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { can, isLoading } = usePermissions();
  const { status } = useSession();
  const [chatUnread, setChatUnread] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((g) => ({ ...g, items: g.items.filter((i) => can(i.permission)) }))
        .filter((g) => g.items.length > 0),
    [can],
  );

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    setMobileOpen((prev) => (prev ? false : prev));
  }, [pathname]);

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

  // Persist collapse state per-user to localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sidebar:collapsed");
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sidebar:collapsed", JSON.stringify(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  // Auto-expand a group when the current route matches one of its items.
  useEffect(() => {
    for (const g of navGroups) {
      if (g.flat) continue;
      const match = g.items.some(
        (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
      );
      if (match && collapsed[g.id]) {
        setCollapsed((prev) => ({ ...prev, [g.id]: false }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Chat unread count + realtime refresh.
  const refreshChatUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/unread-count", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setChatUnread(Number(data.total) || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    refreshChatUnread();
    const int = setInterval(refreshChatUnread, 60_000);
    return () => clearInterval(int);
  }, [status, refreshChatUnread]);

  useRealtimeEvent<ChatEventPayload>(
    "chat:event",
    () => {
      refreshChatUnread();
    },
    [refreshChatUnread],
  );
  useRealtimeEvent<ChatReadPayload>(
    "chat:read",
    () => {
      refreshChatUnread();
    },
    [refreshChatUnread],
  );

  if (pathname === "/login") return null;

  const badgeFor = (key?: NavItem["badgeKey"]): number => {
    if (key === "chatUnread") return chatUnread;
    return 0;
  };

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
        <div className="flex items-center gap-1">
          <UserMenu variant="dark" />
          <NotificationsBell iconClassName="text-white hover:bg-sidebar-hover" />
        </div>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] md:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={cn(
          "fixed right-0 top-0 h-screen w-64 bg-sidebar text-white flex flex-col z-[70] no-print transition-transform duration-300 ease-in-out",
          "border-l border-gold/20",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0",
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

        <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
          {isLoading && visibleGroups.length === 0 && (
            <div className="px-5 py-3 text-sm text-white/50">
              جاري التحميل...
            </div>
          )}

          {visibleGroups.map((group) => {
            const isCollapsed = !!collapsed[group.id];
            const groupUnread = group.items.reduce(
              (sum, i) => sum + badgeFor(i.badgeKey),
              0,
            );

            return (
              <div key={group.id} className="mb-1">
                {!group.flat && group.label && (
                  <button
                    onClick={() =>
                      setCollapsed((p) => ({ ...p, [group.id]: !isCollapsed }))
                    }
                    className="w-full flex items-center gap-2 px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-gold/60 hover:text-gold transition-colors"
                  >
                    {group.icon && <group.icon size={14} />}
                    <span className="flex-1 text-right">{group.label}</span>
                    {isCollapsed && groupUnread > 0 && (
                      <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {groupUnread > 99 ? "99+" : groupUnread}
                      </span>
                    )}
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                  </button>
                )}

                <div
                  className={cn(
                    "overflow-hidden transition-all",
                    !group.flat && isCollapsed
                      ? "max-h-0"
                      : "max-h-[500px]",
                  )}
                >
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href));
                    const badge = badgeFor(item.badgeKey);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-5 py-3 text-sm transition-colors relative",
                          isActive
                            ? "bg-primary-dark text-gold font-bold border-r-[3px] border-gold"
                            : "text-white/80 hover:bg-sidebar-hover hover:text-gold-light",
                        )}
                      >
                        <item.icon size={20} />
                        <span className="flex-1">{item.label}</span>
                        {badge > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
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
