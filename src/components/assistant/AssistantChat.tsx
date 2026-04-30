"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionDraftCard, type AssistantAction } from "./ActionDraftCard";

interface AssistantMessage {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls: unknown;
  toolName: string | null;
  toolCallId: string | null;
  createdAt: string;
}

interface ConversationData {
  conversation: {
    id: number;
    title: string;
    llmTurns: number;
    costUsdTotal: number;
  } | null;
  messages: AssistantMessage[];
  actions: AssistantAction[];
}

interface Props {
  conversationId: number;
}

export function AssistantChat({ conversationId }: Props) {
  const [data, setData] = useState<ConversationData>({
    conversation: null,
    messages: [],
    actions: [],
  });
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/assistant/conversations/${conversationId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(res.status === 404 ? "المحادثة غير موجودة" : "تعذّر تحميل المحادثة");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data.messages.length, data.actions.length, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/assistant/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "تعذّر إرسال الرسالة");
      } else {
        setData((prev) => ({
          conversation: prev.conversation,
          messages: json.messages ?? prev.messages,
          actions: json.actions ?? prev.actions,
        }));
      }
    } catch {
      setError("خطأ في الاتصال");
    } finally {
      setSending(false);
    }
  }, [conversationId, input, sending]);

  const onAction = useCallback(
    async (actionId: number, kind: "confirm" | "reject") => {
      const res = await fetch(`/api/assistant/actions/${actionId}/${kind}`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || "تعذّر تنفيذ العملية");
      }
      await load();
    },
    [load],
  );

  // Build a unified timeline: assistant messages mixed with action cards in
  // creation order.
  const timeline = useMemo(() => {
    type Item =
      | { kind: "msg"; key: string; msg: AssistantMessage }
      | { kind: "action"; key: string; action: AssistantAction };
    const items: Item[] = [];
    for (const m of data.messages) {
      if (m.role === "tool") continue; // Tool result rows are internal — don't render.
      items.push({ kind: "msg", key: `m${m.id}`, msg: m });
    }
    for (const a of data.actions) {
      items.push({ kind: "action", key: `a${a.id}`, action: a });
    }
    items.sort((a, b) => {
      const ta = a.kind === "msg" ? a.msg.createdAt : a.action.createdAt;
      const tb = b.kind === "msg" ? b.msg.createdAt : b.action.createdAt;
      return new Date(ta).getTime() - new Date(tb).getTime();
    });
    return items;
  }, [data.messages, data.actions]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-red-500 max-w-md px-6">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-4 py-3 flex items-center gap-2">
        <Sparkles size={18} className="text-amber-500" />
        <h1 className="font-bold text-sm flex-1 truncate">
          {data.conversation?.title ?? "محادثة"}
        </h1>
        <div className="text-[11px] text-gray-400">
          {data.conversation?.llmTurns ?? 0} مرحلة •{" "}
          {(data.conversation?.costUsdTotal ?? 0).toFixed(4)}$
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {timeline.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-12">
            ابدأ بكتابة طلبك بالعربية أدناه. مثال: «أبو زيد دفع 50 دينار للفندق نيابة عن
            الشريك حسام».
          </div>
        )}
        {timeline.map((item) =>
          item.kind === "msg" ? (
            <MessageBubble key={item.key} msg={item.msg} />
          ) : (
            <ActionDraftCard
              key={item.key}
              action={item.action}
              onConfirm={() => onAction(item.action.id, "confirm")}
              onReject={() => onAction(item.action.id, "reject")}
            />
          ),
        )}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-gray-500 px-2">
            <Loader2 size={14} className="animate-spin" />
            <span>المساعد يفكّر…</span>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-gray-200 bg-white p-3 flex items-end gap-2 safe-bottom"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="مثال: اصرف سلفة 100 دينار لأبو زيد، أو سجّل قيد عن دفعة عميل…"
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="h-10 px-4 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white flex items-center gap-1.5 text-sm font-medium"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          إرسال
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: AssistantMessage }) {
  const isUser = msg.role === "user";
  // Strip <<USER_TEXT>> sentinels added by the engine for prompt-injection defence.
  const content = isUser
    ? msg.content.replace(/^<<USER_TEXT>>\n?/, "").replace(/\n?<<END_USER_TEXT>>$/, "")
    : msg.content;
  if (!content && msg.role === "assistant") {
    // Assistant turn that only emitted tool calls — show a quiet placeholder.
    return (
      <div className="text-[11px] text-gray-400 italic px-2">المساعد يستدعي أداة…</div>
    );
  }
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2 max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed shadow-sm",
          isUser
            ? "bg-amber-500 text-white rounded-tr-sm"
            : "bg-white text-gray-800 border border-gray-200 rounded-tl-sm",
        )}
      >
        {content}
      </div>
    </div>
  );
}
