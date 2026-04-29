"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  Inbox,
  Loader2,
  MessageSquare,
  Calendar,
  Settings,
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

  // External mark-read triggers (e.g. the WhatsApp inbox calls
  // /api/notifications/mark-read with a contactPhone filter when the user
  // opens a thread) dispatch this CustomEvent so every NotificationsBell
  // instance in the app refreshes its badge without a page reload.
  useEffect(() => {
    const onChanged = () => {
      refreshCount();
      if (open) load();
    };
    window.addEventListener("notifications:changed", onChanged);
    return () => window.removeEventListener("notifications:changed", onChanged);
  }, [open, refreshCount, load]);

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

  // Opening the dropdown is the user's implicit "I saw these" gesture —
  // mirror Facebook / Instagram / Slack and clear the badge immediately.
  // The individual rows also fade to the "read" styling so the mental model
  // stays consistent with the count on the icon.
  const handleOpen = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    // Optimistic: badge → 0 before the network round-trip so it feels instant.
    setUnread(0);
    void load();
    // Fire the mark-all-read server call. We intentionally don't await so the
    // list renders right away; the server call races harmlessly with `load()`.
    fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
      .then(() => {
        // Once persisted, flip every locally-cached row to "read" so it
        // loses the bold / highlighted styling even if `load()` raced ahead
        // and returned them as unread.
        setItems((prev) =>
          prev.map((n) =>
            n.readAt ? n : { ...n, readAt: new Date().toISOString() },
          ),
        );
        setUnread(0);
      })
      .catch(() => {
        // Rollback-ish: if the server refused, pull the real count back.
        void refreshCount();
      });
  }, [open, load, refreshCount]);

  if (status !== "authenticated") return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
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
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
            <h3 className="font-bold text-gray-800 text-sm">الإشعارات</h3>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <CheckCheck size={12} /> تعليم الكل كمقروء
                </button>
              )}
              <Link
                href="/notifications/preferences"
                onClick={() => setOpen(false)}
                className="text-xs text-gray-500 hover:text-primary flex items-center gap-1"
                title="تفضيلات الإشعارات"
              >
                <Settings size={12} />
              </Link>
            </div>
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
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <Inbox size={12} />
              فتح مركز الإشعارات
            </Link>
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
