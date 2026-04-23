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

  // Sticky conversations are individually-hydrated rows (via deep-link / push
  // notification click) that must remain resolvable via `activeConversation`
  // even when the current filter scope would exclude them from `loadList`.
  const [stickyConversations, setStickyConversations] = useState<
    Record<string, ConversationSummary>
  >({});

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
      const r = await fetch(
        "/api/whatsapp/conversations/counts?status=open",
        { cache: "no-store" },
      );
      if (!r.ok) return;
      const d = (await r.json()) as {
        all: number;
        mine: number;
        unassigned: number;
      };
      setCounts({ all: d.all, mine: d.mine, unassigned: d.unassigned });
    } catch {
      /* best-effort */
    }
  }, []);

  /**
   * Fetches a single conversation by phone regardless of the current filter
   * scope / status, and merges it into `conversations` if not present.
   *
   * Used by deep-links (push notification click): the tapped conversation
   * might be assigned to someone else or resolved, so the inbox filter would
   * otherwise hide it, leaving `activeConversation` = null and the user on a
   * dead-end empty state.
   */
  const hydrateConversation = useCallback(async (phone: string) => {
    try {
      const res = await fetch(
        `/api/whatsapp/conversations/${encodeURIComponent(phone)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return null;
      type LastMsg = NonNullable<ConversationSummary["lastMessage"]>;
      const raw = (await res.json()) as {
        id: number;
        contactPhone: string;
        contact: ConversationSummary["contact"];
        assignedTo: ConversationSummary["assignedTo"];
        assignedToUserId: number | null;
        status: ConversationSummary["status"];
        priority: ConversationSummary["priority"];
        isMuted: boolean;
        unreadCount: number;
        lastMessageAt: string | null;
        messages?: LastMsg[];
      };
      const summary: ConversationSummary = {
        id: raw.id,
        contactPhone: raw.contactPhone,
        contact: raw.contact
          ? {
              id: raw.contact.id,
              displayName: raw.contact.displayName,
              nickname: raw.contact.nickname,
              company: raw.contact.company,
              tags: raw.contact.tags,
              isBlocked: raw.contact.isBlocked,
            }
          : null,
        assignedTo: raw.assignedTo,
        assignedToUserId: raw.assignedToUserId,
        status: raw.status,
        priority: raw.priority,
        isMuted: raw.isMuted,
        unreadCount: raw.unreadCount,
        lastMessageAt: raw.lastMessageAt,
        lastMessage: (raw.messages && raw.messages[0]) || null,
      };
      setConversations((prev) => {
        if (prev.some((c) => c.contactPhone === summary.contactPhone)) {
          return prev.map((c) =>
            c.contactPhone === summary.contactPhone ? summary : c,
          );
        }
        return [summary, ...prev];
      });
      // Remember it so a subsequent `loadList()` (which replaces the whole
      // array) can't drop it out from under a selected deep-link.
      setStickyConversations((prev) => ({
        ...prev,
        [summary.contactPhone]: summary,
      }));
      return summary;
    } catch {
      return null;
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
    () =>
      conversations.find((c) => c.contactPhone === selectedPhone) ??
      (selectedPhone ? (stickyConversations[selectedPhone] ?? null) : null),
    [conversations, stickyConversations, selectedPhone],
  );

  return {
    conversations,
    loadingList,
    loadList,

    selectedPhone,
    setSelectedPhone,
    hydrateConversation,

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
