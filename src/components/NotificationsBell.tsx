"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  Loader2,
  MessageSquare,
  Calendar,
  UserPlus,
  AtSign,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/lib/collab/types";
import {
  useRealtimeEvent,
  type NotificationPayload,
} from "@/lib/realtime/client";
import { useSession } from "next-auth/react";

const TYPE_ICONS: Record<string, typeof Bell> = {
  "chat.message": MessageSquare,
  "chat.mention": AtSign,
  "task.assigned": UserPlus,
  "task.due": Calendar,
  "task.commented": MessageSquare,
};

export function NotificationsBell({
  iconClassName,
}: {
  iconClassName?: string;
}) {
  const { status } = useSession();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnread(data.unreadCount || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      setUnread(data.count || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    refreshCount();
    const int = setInterval(() => refreshCount(), 60_000);
    return () => clearInterval(int);
  }, [status, refreshCount]);

  useRealtimeEvent<NotificationPayload>(
    "notification:new",
    () => {
      refreshCount();
      if (open) load();
    },
    [open, refreshCount, load],
  );

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

  async function markAllRead() {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    setUnread(0);
  }

  async function markOne(id: number) {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
  }

  if (status !== "authenticated") return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        className={cn(
          "relative p-2 rounded-lg transition-colors",
          iconClassName,
        )}
        aria-label="الإشعارات"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 mt-2 w-80 max-w-[calc(100vw-1rem)] bg-white rounded-xl shadow-lg border border-gray-200 z-[80] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm">الإشعارات</h3>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck size={12} /> تعليم الكل كمقروء
              </button>
            )}
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                لا توجد إشعارات
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    item={n}
                    onClick={() => {
                      if (!n.readAt) markOne(n.id);
                      setOpen(false);
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  item,
  onClick,
}: {
  item: NotificationItem;
  onClick: () => void;
}) {
  const Icon = TYPE_ICONS[item.type] || AlertCircle;
  const body = (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors",
        !item.readAt && "bg-primary/5",
      )}
    >
      <span
        className={cn(
          "shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
          !item.readAt
            ? "bg-primary/10 text-primary"
            : "bg-gray-100 text-gray-500",
        )}
      >
        <Icon size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm text-gray-800 truncate",
            !item.readAt && "font-semibold",
          )}
        >
          {item.title}
        </p>
        {item.body && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
            {item.body}
          </p>
        )}
        <p className="text-[10px] text-gray-400 mt-0.5">
          {new Date(item.createdAt).toLocaleString("ar-EG", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      </div>
      {!item.readAt && (
        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
      )}
    </div>
  );

  if (item.linkUrl) {
    return (
      <li>
        <Link href={item.linkUrl} onClick={onClick} className="block">
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li onClick={onClick} className="cursor-pointer">
      {body}
    </li>
  );
}

// Unused icon placeholder to keep the Check import usable elsewhere.
void Check;
