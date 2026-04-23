"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  ConversationSummary,
  Message,
  ScopeFilter,
  StatusFilter,
} from "../_types";
import { readJsonSafe } from "../_utils";

/**
 * Encapsulates WhatsApp inbox data loading: conversations list, active
 * thread messages, counts, and the "mark as read" optimistic update.
 *
 * Realtime events are merged in by the caller via `mergeIncoming*()` —
 * this hook stays responsible for HTTP loads only, so we don't couple it
 * to socket plumbing.
 */
export function useInboxData(params: {
  scope: ScopeFilter;
  status: StatusFilter;
  search: string;
}) {
  const { scope, status, search } = params;
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [counts, setCounts] = useState({ all: 0, mine: 0, unassigned: 0 });

  const abortRef = useRef<AbortController | null>(null);

  const loadList = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoadingList(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", scope);
      qs.set("status", status);
      if (search.trim()) qs.set("search", search.trim());
      qs.set("limit", "80");
      const res = await fetch(`/api/whatsapp/conversations?${qs}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      const data = await readJsonSafe<{ conversations: ConversationSummary[] }>(
        res,
        "فشل تحميل المحادثات",
      );
      setConversations(data.conversations ?? []);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoadingList(false);
    }
  }, [scope, status, search]);

  const loadCounts = useCallback(async () => {
    try {
      const build = async (s: ScopeFilter) => {
        const qs = new URLSearchParams();
        qs.set("scope", s);
        qs.set("status", "open");
        qs.set("limit", "1");
        const r = await fetch(`/api/whatsapp/conversations?${qs}`, {
          cache: "no-store",
        });
        if (!r.ok) return 0;
        const d = (await r.json()) as { conversations: unknown[] };
        return d.conversations.length;
      };
      const [all, mine, unassigned] = await Promise.all([
        build("all"),
        build("mine"),
        build("unassigned"),
      ]);
      setCounts({ all, mine, unassigned });
    } catch {
      /* best-effort */
    }
  }, []);

  const loadMessages = useCallback(async (phone: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/whatsapp/messages?contact=${encodeURIComponent(phone)}&limit=200`,
        { cache: "no-store" },
      );
      const data = await readJsonSafe<Message[]>(res, "فشل تحميل الرسائل");
      setMessages(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const markRead = useCallback(async (phone: string) => {
    try {
      const res = await fetch("/api/whatsapp/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: phone }),
      });
      if (!res.ok) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.contactPhone === phone ? { ...c, unreadCount: 0 } : c,
        ),
      );
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadCounts();
    const int = setInterval(loadCounts, 60_000);
    return () => clearInterval(int);
  }, [loadCounts]);

  useEffect(() => {
    if (!selectedPhone) {
      setMessages([]);
      return;
    }
    loadMessages(selectedPhone);
    markRead(selectedPhone);
  }, [selectedPhone, loadMessages, markRead]);

  // Merge in a brand-new message from realtime pushes.
  const mergeIncomingMessage = useCallback((m: Message) => {
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      return [...prev, m].sort((a, b) => a.id - b.id);
    });
  }, []);

  const patchMessageStatus = useCallback(
    (id: number, patch: Partial<Message>) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [],
  );

  const patchConversation = useCallback(
    (
      contactPhone: string,
      patch: Partial<ConversationSummary> | ((prev: ConversationSummary) => ConversationSummary),
    ) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.contactPhone === contactPhone
            ? typeof patch === "function"
              ? patch(c)
              : { ...c, ...patch }
            : c,
        ),
      );
    },
    [],
  );

  const activeConversation = useMemo(
    () => conversations.find((c) => c.contactPhone === selectedPhone) ?? null,
    [conversations, selectedPhone],
  );

  return {
    conversations,
    loadingList,
    loadList,

    selectedPhone,
    setSelectedPhone,

    messages,
    loadingMessages,
    loadMessages,
    setMessages,

    counts,
    loadCounts,

    markRead,

    activeConversation,

    mergeIncomingMessage,
    patchMessageStatus,
    patchConversation,
  };
}
