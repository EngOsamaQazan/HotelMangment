"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function initialsFor(name: string | null | undefined): string {
  if (!name) return "؟";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "");
}

interface UserMenuProps {
  /** Visual variant — `light` for the desktop top bar, `dark` for the mobile sidebar bar. */
  variant?: "light" | "dark";
  /** If true, hide the name and only show the avatar (used in the mobile bar). */
  compact?: boolean;
}

export function UserMenu({ variant = "light", compact = false }: UserMenuProps) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDown);
      return () => document.removeEventListener("mousedown", onDown);
    }
  }, [open]);

  if (status !== "authenticated" || !session?.user) return null;

  const user = session.user as {
    id?: string | number;
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  };
  const userId = user.id;
  const name = user.name ?? "";
  const email = user.email ?? "";
  const hasAvatar = Boolean(user.avatarUrl);
  const avatarSrc = hasAvatar && userId ? `/api/files/avatar/${userId}` : null;

  const isDark = variant === "dark";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-2 rounded-full transition-colors",
          compact ? "p-0.5" : "py-1 ps-1 pe-2",
          isDark
            ? "text-white hover:bg-sidebar-hover"
            : "text-gray-700 hover:bg-gray-100",
        )}
        aria-label="الحساب"
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full overflow-hidden shrink-0 font-bold",
            compact ? "w-8 h-8 text-xs" : "w-8 h-8 text-xs",
            isDark
              ? "bg-gold/20 text-gold border border-gold/40"
              : "bg-primary/10 text-primary",
          )}
        >
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initialsFor(name)}</span>
          )}
        </span>
        {!compact && (
          <>
            <span className="text-sm font-semibold truncate max-w-[80px] sm:max-w-[140px]">
              {name}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                "transition-transform shrink-0",
                open && "rotate-180",
                isDark ? "text-white/70" : "text-gray-400",
              )}
            />
          </>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-60 bg-white rounded-xl shadow-lg border border-gray-200 z-[80] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            <span className="flex items-center justify-center rounded-full overflow-hidden shrink-0 w-10 h-10 text-sm font-bold bg-primary/10 text-primary">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt={name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initialsFor(name)}</span>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">
                {name}
              </p>
              <p className="text-xs text-gray-500 truncate">{email}</p>
            </div>
          </div>
          <ul className="py-1 text-sm">
            <li>
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <UserIcon size={16} className="text-gray-500" />
                <span>الملف الشخصي</span>
              </Link>
            </li>
            <li>
              <button
                onClick={() => {
                  setOpen(false);
                  signOut({ callbackUrl: "/login" });
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={16} />
                <span>تسجيل الخروج</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
