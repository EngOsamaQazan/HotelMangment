"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  Search,
  Plus,
  Users,
  CircleDot,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatConversation, UserLite } from "@/lib/collab/types";
import { UserAvatar } from "@/components/tasks/shared";
import {
  useRealtime,
  useRealtimeEvent,
  type ChatEventPayload,
  type NotificationPayload,
} from "@/lib/realtime/client";
import { NewConversationModal } from "./NewConversationModal";
import { useSession } from "next-auth/react";

interface Props {
  activeId: number | null;
}

export function ChatSidebar({ activeId }: Props) {
  const { data: session } = useSession();
  const myId = Number((session?.user as { id?: string | number } | undefined)?.id) || 0;
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showNew, setShowNew] = useState(false);
  const pathname = usePathname();
  const { connected } = useRealtime();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) throw new Error("فشل التحميل");
      const data = await res.json();
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, pathname]);

  // Refetch when any chat event fires or any new notification arrives.
  useRealtimeEvent<ChatEventPayload>("chat:event", () => load(), []);
  useRealtimeEvent<NotificationPayload>("notification:new", (p) => {
    if (p.op === "insert") load();
  }, []);

  function titleOf(c: ChatConversation): string {
    if (c.title) return c.title;
    if (c.type === "task" && c.task) return `مهمة: ${c.task.title}`;
    const others = c.participants.filter((p) => p.userId !== myId);
    if (others.length === 0) return "أنت";
    return others.map((p) => p.user.name).join("، ");
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const t = titleOf(c).toLowerCase();
      const last = (c.lastMessage?.body || "").toLowerCase();
      return t.includes(q) || last.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, query, myId]);

  return (
    <aside className="w-full md:w-80 lg:w-96 shrink-0 bg-card-bg border-l border-gray-200 flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-primary" />
          <h2 className="font-bold text-gray-800">المحادثات</h2>
          <span
            title={connected ? "متصل" : "غير متصل"}
            className={cn(
              "w-2 h-2 rounded-full",
              connected ? "bg-emerald-500" : "bg-gray-400",
            )}
          />
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="p-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors"
          title="محادثة جديدة"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <Search
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg ps-8 pe-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-gray-400 text-center">
            جاري التحميل...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            لا توجد محادثات بعد.
            <button
              onClick={() => setShowNew(true)}
              className="block mx-auto mt-3 text-primary underline"
            >
              ابدأ محادثة جديدة
            </button>
          </div>
        ) : (
          <ul>
            {filtered.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                title={titleOf(c)}
                myId={myId}
                active={c.id === activeId}
              />
            ))}
          </ul>
        )}
      </div>

      {showNew && (
        <NewConversationModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            window.location.href = `/chat/${id}`;
          }}
        />
      )}
    </aside>
  );
}

function ConversationRow({
  conversation: c,
  title,
  myId,
  active,
}: {
  conversation: ChatConversation;
  title: string;
  myId: number;
  active: boolean;
}) {
  const Icon =
    c.type === "dm"
      ? CircleDot
      : c.type === "task"
        ? Hash
        : Users;
  const others = c.participants.filter((p) => p.userId !== myId);
  const peer: UserLite | undefined = others[0]?.user;

  return (
    <li>
      <Link
        href={`/chat/${c.id}`}
        className={cn(
          "flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50",
          active && "bg-primary/5 border-r-4 border-r-primary",
        )}
      >
        <div className="shrink-0 relative">
          {c.type === "dm" && peer ? (
            <UserAvatar user={peer} size={42} />
          ) : (
            <div
              className={cn(
                "w-[42px] h-[42px] rounded-full flex items-center justify-center text-white",
                c.type === "task" ? "bg-amber-500" : "bg-indigo-500",
              )}
            >
              <Icon size={20} />
            </div>
          )}
          {(c.unreadCount ?? 0) > 0 && (
            <span className="absolute -top-1 -start-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {(c.unreadCount ?? 0) > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-800 truncate">
              {title}
            </h3>
            {c.lastMessage && (
              <span className="text-[10px] text-gray-400 shrink-0">
                {new Date(c.lastMessage.createdAt).toLocaleTimeString("ar-EG", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-xs truncate mt-0.5",
              (c.unreadCount ?? 0) > 0
                ? "text-gray-800 font-semibold"
                : "text-gray-500",
            )}
          >
            {c.lastMessage ? (
              <>
                {c.lastMessage.senderId === myId && (
                  <span className="text-gray-400">أنت: </span>
                )}
                {c.lastMessage.body}
              </>
            ) : (
              <span className="italic text-gray-400">لم تبدأ المحادثة بعد</span>
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}
