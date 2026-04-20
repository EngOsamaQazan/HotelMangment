"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Send,
  Paperclip,
  Smile,
  X,
  Reply,
  CornerUpLeft,
  Loader2,
  CheckCheck,
  Check,
  ChevronRight,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import type {
  ChatConversation,
  ChatMessage as ChatMessageT,
} from "@/lib/collab/types";
import { UserAvatar } from "@/components/tasks/shared";
import {
  useConversationRoom,
  useRealtime,
  useRealtimeEvent,
  type ChatEventPayload,
  type ChatReactionPayload,
  type ChatReadPayload,
  type ChatTypingPayload,
} from "@/lib/realtime/client";

const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

interface Props {
  conversationId: number;
}

export function ChatThread({ conversationId }: Props) {
  const { data: session } = useSession();
  const myId =
    Number((session?.user as { id?: string | number } | undefined)?.id) || 0;
  const { sendTyping } = useRealtime();
  useConversationRoom(conversationId);

  const [conversation, setConversation] = useState<ChatConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessageT[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageT | null>(null);
  const [typing, setTyping] = useState<Record<number, { name: string; until: number }>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didAutoScrollRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load conversation meta
  const loadConversation = useCallback(async () => {
    const res = await fetch(`/api/chat/conversations/${conversationId}`);
    if (!res.ok) {
      toast.error("لم يُعثر على المحادثة");
      return;
    }
    setConversation(await res.json());
  }, [conversationId]);

  // Initial messages (most recent page)
  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/messages?limit=40`,
      );
      if (!res.ok) throw new Error("فشل التحميل");
      const data = await res.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);
      didAutoScrollRef.current = false;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const scrollEl = scrollRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/messages?cursor=${nextCursor}&limit=40`,
      );
      if (!res.ok) throw new Error("فشل تحميل المزيد");
      const data = await res.json();
      setMessages((prev) => [...data.messages, ...prev]);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(!!data.nextCursor);
      requestAnimationFrame(() => {
        if (scrollEl) {
          const diff = scrollEl.scrollHeight - prevHeight;
          scrollEl.scrollTop = diff;
        }
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, nextCursor, loadingMore]);

  const markRead = useCallback(async () => {
    await fetch(`/api/chat/conversations/${conversationId}/read`, {
      method: "POST",
    });
  }, [conversationId]);

  useEffect(() => {
    loadConversation();
    loadMessages();
  }, [loadConversation, loadMessages]);

  // Auto-scroll to bottom once messages are loaded for the first time.
  useEffect(() => {
    if (loading || didAutoScrollRef.current) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      didAutoScrollRef.current = true;
      markRead();
    }
  }, [loading, messages, markRead]);

  // Mark read when tab gains focus.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") markRead();
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [markRead]);

  // Realtime: new/update/delete messages
  const fetchMessage = useCallback(
    async (messageId: number): Promise<ChatMessageT | null> => {
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/messages?limit=1&cursor=${messageId + 1}`,
        );
        if (!res.ok) return null;
        const data = await res.json();
        const m = (data.messages ?? []).find(
          (x: ChatMessageT) => x.id === messageId,
        );
        return m ?? null;
      } catch {
        return null;
      }
    },
    [conversationId],
  );

  useRealtimeEvent<ChatEventPayload>(
    "chat:event",
    async (p) => {
      if (p.conversationId !== conversationId) return;
      if (p.op === "insert") {
        const msg = await fetchMessage(p.messageId);
        if (msg) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Scroll to bottom if we're near the bottom
          const el = scrollRef.current;
          if (el) {
            const nearBottom =
              el.scrollHeight - el.scrollTop - el.clientHeight < 200;
            if (nearBottom) {
              requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight;
              });
            }
          }
          if (p.senderId !== myId) markRead();
        }
      } else if (p.op === "delete" || p.op === "update") {
        const msg = await fetchMessage(p.messageId);
        if (msg) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? msg : m)),
          );
        }
      }
    },
    [conversationId, myId],
  );

  useRealtimeEvent<ChatReactionPayload>(
    "chat:reaction",
    (p) => {
      if (p.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== p.messageId) return m;
          const next = (m.reactions ?? []).filter(
            (r) => !(r.userId === p.userId && r.emoji === p.emoji),
          );
          if (p.op === "add") {
            next.push({ userId: p.userId, emoji: p.emoji });
          }
          return { ...m, reactions: next };
        }),
      );
    },
    [conversationId],
  );

  useRealtimeEvent<ChatReadPayload>(
    "chat:read",
    (p) => {
      if (p.conversationId !== conversationId) return;
      setConversation((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map((part) =>
            part.userId === p.userId
              ? { ...part, lastReadAt: p.lastReadAt }
              : part,
          ),
        };
      });
    },
    [conversationId],
  );

  useRealtimeEvent<ChatTypingPayload>(
    "chat:typing",
    (p) => {
      if (p.conversationId !== conversationId || p.userId === myId) return;
      const peer = conversation?.participants.find((x) => x.userId === p.userId);
      if (!peer) return;
      setTyping((prev) => {
        const next = { ...prev };
        if (p.typing) {
          next[p.userId] = { name: peer.user.name, until: Date.now() + 4000 };
        } else {
          delete next[p.userId];
        }
        return next;
      });
    },
    [conversationId, myId, conversation?.participants],
  );

  // Typing cleanup
  useEffect(() => {
    const t = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.until > now) next[Number(k)] = v;
        }
        return Object.keys(next).length === Object.keys(prev).length
          ? prev
          : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Typing emit
  const typingDebounceRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  function emitTyping() {
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      sendTyping(conversationId, true);
    }
    if (typingDebounceRef.current) window.clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      sendTyping(conversationId, false);
    }, 2500);
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const text = sendText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: text,
            replyToId: replyTo?.id,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل الإرسال");
      }
      const msg = (await res.json()) as ChatMessageT;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      setSendText("");
      setReplyTo(null);
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      typingActiveRef.current = false;
      sendTyping(conversationId, false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setSending(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // First create a message with a placeholder body (to have an id), then upload
      // Upload first, server attaches to most recent message? No — API expects a messageId.
      // Strategy: create message with placeholder body = "📎 مرفق", then attach.
      const placeholder = `📎 ${file.name}`;
      const mRes = await fetch(
        `/api/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: placeholder }),
        },
      );
      if (!mRes.ok) throw new Error("فشل إنشاء الرسالة");
      const msg = (await mRes.json()) as ChatMessageT;
      const fd = new FormData();
      fd.append("file", file);
      const aRes = await fetch(`/api/chat/messages/${msg.id}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!aRes.ok) {
        const err = await aRes.json().catch(() => ({}));
        throw new Error(err.error || "فشل رفع المرفق");
      }
      // Refetch the message to get attachments
      const fresh = await fetchMessage(msg.id);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx === -1) return fresh ? [...prev, fresh] : prev;
        const next = [...prev];
        if (fresh) next[idx] = fresh;
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleReaction(messageId: number, emoji: string) {
    await fetch(`/api/chat/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  }

  async function deleteMessage(id: number) {
    if (!confirm("حذف الرسالة؟")) return;
    const res = await fetch(`/api/chat/messages/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("فشل الحذف");
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, deletedAt: new Date().toISOString(), body: "" } : m)),
    );
  }

  const title = conversationTitle(conversation, myId);
  const typingNames = Object.values(typing).map((t) => t.name);

  return (
    <main className="flex-1 flex flex-col bg-gray-50 h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center gap-3 shrink-0">
        <Link
          href="/chat"
          className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <ChevronRight size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-gray-800 truncate">{title || "..."}</h1>
          <p className="text-xs text-gray-400">
            {conversation?.participants.filter((p) => !p.leftAt).length ?? 0}{" "}
            مشارك
          </p>
        </div>
        {conversation?.type === "task" && conversation.task && (
          <Link
            href={`/tasks/${conversation.task.boardId}?task=${conversation.taskId}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            فتح المهمة
          </Link>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop < 100 && hasMore && !loadingMore) loadOlder();
        }}
      >
        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}
        {hasMore && !loading && (
          <div className="flex justify-center">
            <button
              onClick={loadOlder}
              disabled={loadingMore}
              className="text-xs text-primary hover:underline"
            >
              {loadingMore ? "جاري التحميل..." : "تحميل رسائل أقدم"}
            </button>
          </div>
        )}
        {messages.map((m, idx) => {
          const prev = messages[idx - 1];
          const showAvatar = !prev || prev.senderId !== m.senderId;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              mine={m.senderId === myId}
              showAvatar={showAvatar}
              onReply={() => setReplyTo(m)}
              onReact={(emoji) => toggleReaction(m.id, emoji)}
              onDelete={() => deleteMessage(m.id)}
              conversation={conversation}
              myId={myId}
            />
          );
        })}
        {typingNames.length > 0 && (
          <div className="text-xs text-gray-500 italic px-2 py-1">
            {typingNames.join("، ")} يكتب...
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={sendMessage}
        className="shrink-0 bg-white border-t border-gray-200 p-3 space-y-2"
      >
        {replyTo && (
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
            <Reply size={12} className="text-primary" />
            <div className="flex-1 min-w-0">
              <span className="text-primary font-medium">
                ردّ على {replyTo.sender.name}:
              </span>
              <span className="text-gray-500 truncate block">
                {replyTo.body}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="p-1 rounded hover:bg-gray-200"
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-primary"
            title="مرفق"
          >
            <Paperclip size={18} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={onFile}
          />
          <textarea
            value={sendText}
            rows={1}
            onChange={(e) => {
              setSendText(e.target.value);
              emitTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="اكتب رسالة..."
            className="flex-1 resize-none border border-gray-200 rounded-lg px-3 py-2 text-sm max-h-32 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <button
            type="submit"
            disabled={sending || !sendText.trim()}
            className="p-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50"
          >
            {sending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </form>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  mine,
  showAvatar,
  conversation,
  myId,
  onReply,
  onReact,
  onDelete,
}: {
  message: ChatMessageT;
  mine: boolean;
  showAvatar: boolean;
  conversation: ChatConversation | null;
  myId: number;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onDelete: () => void;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const reactionGroups = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of message.reactions ?? []) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.userId === myId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return [...map.entries()];
  }, [message.reactions, myId]);

  // Read receipt for my own messages (group/DM)
  const readBy = useMemo(() => {
    if (!mine || !conversation) return [];
    return conversation.participants
      .filter(
        (p) =>
          p.userId !== myId &&
          p.lastReadAt &&
          new Date(p.lastReadAt).getTime() >=
            new Date(message.createdAt).getTime(),
      )
      .map((p) => p.user);
  }, [mine, conversation, message.createdAt, myId]);

  if (message.deletedAt) {
    return (
      <div
        className={cn(
          "flex items-end gap-2 group",
          mine ? "flex-row-reverse" : "flex-row",
        )}
      >
        {!mine && showAvatar ? (
          <UserAvatar user={message.sender} size={28} />
        ) : (
          <div className="w-7" />
        )}
        <div
          className={cn(
            "px-3 py-1.5 rounded-2xl text-xs italic text-gray-400 bg-gray-100",
            mine ? "rounded-bl-sm" : "rounded-br-sm",
          )}
        >
          (رسالة محذوفة)
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-end gap-2 group relative",
        mine ? "flex-row-reverse" : "flex-row",
      )}
    >
      {!mine && (
        <div className="w-7 shrink-0">
          {showAvatar && <UserAvatar user={message.sender} size={28} />}
        </div>
      )}
      <div className={cn("max-w-[78%] relative", mine && "text-start")}>
        {!mine && showAvatar && (
          <p className="text-[11px] text-gray-500 font-medium px-2 mb-0.5">
            {message.sender.name}
          </p>
        )}
        {message.replyTo && (
          <div
            className={cn(
              "text-[11px] bg-black/5 rounded-lg p-2 mb-1 border-r-2",
              mine ? "border-r-white/40" : "border-r-primary",
            )}
          >
            <p className="font-medium text-gray-600">
              {message.replyTo.sender.name}
            </p>
            <p className="text-gray-500 line-clamp-2">
              {message.replyTo.deletedAt
                ? "(رسالة محذوفة)"
                : message.replyTo.body}
            </p>
          </div>
        )}
        <div
          className={cn(
            "px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words shadow-sm",
            mine
              ? "bg-primary text-white rounded-br-sm"
              : "bg-white text-gray-800 rounded-bl-sm border border-gray-100",
          )}
        >
          {message.body}
          {message.attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/api/files/chat/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg",
                    mine
                      ? "bg-white/15 hover:bg-white/25 text-white"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-700",
                  )}
                >
                  <Paperclip size={12} />
                  <span className="truncate">{a.fileName}</span>
                  <span className="opacity-70 shrink-0">
                    {(a.size / 1024).toFixed(0)} KB
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 mt-0.5 px-1",
            mine ? "justify-end flex-row-reverse" : "justify-start",
          )}
        >
          <span className="text-[10px] text-gray-400">
            {new Date(message.createdAt).toLocaleTimeString("ar-EG", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {message.editedAt && (
            <span className="text-[10px] text-gray-400 italic">
              (معدّلة)
            </span>
          )}
          {mine &&
            (readBy.length > 0 ? (
              <span
                className="text-[10px] text-blue-500 flex items-center gap-0.5"
                title={`قرأها: ${readBy.map((u) => u.name).join("، ")}`}
              >
                <CheckCheck size={11} />
              </span>
            ) : (
              <Check size={11} className="text-gray-300" />
            ))}
        </div>

        {reactionGroups.length > 0 && (
          <div
            className={cn("flex gap-1 flex-wrap mt-1", mine && "justify-end")}
          >
            {reactionGroups.map(([emoji, { count, mine: myReact }]) => (
              <button
                key={emoji}
                onClick={() => onReact(emoji)}
                className={cn(
                  "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-xs",
                  myReact
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-white border-gray-200 text-gray-600",
                )}
              >
                <span>{emoji}</span>
                <span className="text-[10px]">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div
        className={cn(
          "opacity-0 group-hover:opacity-100 transition-opacity relative",
          "flex items-center gap-0.5",
        )}
      >
        <button
          onClick={() => setShowReactions((s) => !s)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
          title="تفاعل"
        >
          <Smile size={14} />
        </button>
        <button
          onClick={onReply}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
          title="ردّ"
        >
          <CornerUpLeft size={14} />
        </button>
        {mine && (
          <>
            <button
              onClick={() => setMenuOpen((s) => !s)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full end-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-md z-10 min-w-[120px] py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="w-full flex items-center gap-1.5 text-start px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={12} /> حذف
                </button>
              </div>
            )}
          </>
        )}
        {showReactions && (
          <div
            className={cn(
              "absolute bottom-full mb-1 bg-white border border-gray-200 rounded-full shadow-md px-1 py-0.5 flex gap-0.5 z-10",
              mine ? "start-0" : "end-0",
            )}
          >
            {REACTIONS.map((em) => (
              <button
                key={em}
                onClick={() => {
                  onReact(em);
                  setShowReactions(false);
                }}
                className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded-full"
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function conversationTitle(
  c: ChatConversation | null,
  myId: number,
): string | null {
  if (!c) return null;
  if (c.title) return c.title;
  if (c.type === "task" && c.task) return `مهمة: ${c.task.title}`;
  const others = c.participants.filter((p) => p.userId !== myId && !p.leftAt);
  if (others.length === 0) return "أنت";
  return others.map((p) => p.user.name).join("، ");
}

