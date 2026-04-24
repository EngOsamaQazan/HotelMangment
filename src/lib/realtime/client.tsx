"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, Socket } from "socket.io-client";
import { useSession } from "next-auth/react";

// ───────────────────────────────────────────────────────────────
// Event payload types (mirror realtime/src/server.js emits)
// ───────────────────────────────────────────────────────────────

export interface ChatEventPayload {
  op: "insert" | "update" | "delete";
  conversationId: number;
  messageId: number;
  senderId: number;
}
export interface ChatReactionPayload {
  op: "add" | "remove";
  conversationId: number;
  messageId: number;
  emoji: string;
  userId: number;
}
export interface ChatReadPayload {
  op: "read";
  conversationId: number;
  userId: number;
  lastReadAt: string | null;
}
export interface ChatTypingPayload {
  conversationId: number;
  userId: number;
  typing: boolean;
}
export interface TaskEventPayload {
  op: "create" | "update" | "move" | "delete";
  boardId: number;
  taskId: number;
  columnId?: number;
  oldColumnId?: number;
}
export interface NotificationPayload {
  op: "insert";
  userId: number;
  notificationId: number;
}

// ── WhatsApp realtime payloads (mirror src/lib/whatsapp/fanout.ts) ──
export interface WhatsAppMessagePayload {
  op: "message:new" | "message:status";
  conversationId: number;
  contactPhone: string;
  contactName?: string | null;
  messageId: number;
  /** Preview body ("📷 صورة" for images) — suitable for toasts + OS push. */
  body?: string | null;
  /** Real caption / text — `null` for media with no caption. Use for merging. */
  rawBody?: string | null;
  type?: string;
  /** Meta media id — present for image/video/audio/document/sticker rows. */
  mediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
  mediaSize?: number | null;
  createdAt?: string;
  status?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  targetUserIds?: number[];
}

export interface WhatsAppConversationPayload {
  op: "conversation:update";
  conversationId: number;
  contactPhone: string;
  reason: string;
  actorUserId?: number | null;
  unreadCount?: number;
  assignedToUserId?: number | null;
  status?: string;
  priority?: string;
  targetUserIds?: number[];
}

export interface WhatsAppContactPayload {
  op: "contact:update";
  contactId: number;
  contactPhone: string;
  displayName?: string | null;
  tags?: string[];
  isBlocked?: boolean;
}

interface RealtimeContextValue {
  socket: Socket | null;
  connected: boolean;
  joinConversation: (id: number) => void;
  leaveConversation: (id: number) => void;
  joinBoard: (id: number) => void;
  leaveBoard: (id: number) => void;
  sendTyping: (conversationId: number, typing: boolean) => void;
  joinWhatsAppInbox: () => void;
  leaveWhatsAppInbox: () => void;
  joinWhatsAppConversation: (conversationId: number) => void;
  leaveWhatsAppConversation: (conversationId: number) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const rooms = useRef({
    conversations: new Set<number>(),
    boards: new Set<number>(),
    waConversations: new Set<number>(),
    waInbox: false,
  });

  useEffect(() => {
    if (status !== "authenticated") {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }
    // Connect to current origin — Apache proxies /socket.io/ to :3001.
    const s = io({
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      // Cap retries so broken realtime infra doesn't spam the console forever.
      // After ~1 min of failures we give up silently; the UI still works via
      // plain HTTP polling and push notifications remain unaffected.
      reconnectionAttempts: 8,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 10000,
    });
    let connectErrorCount = 0;
    s.on("connect", () => {
      setConnected(true);
      connectErrorCount = 0;
      // Re-join rooms after reconnect.
      for (const cid of rooms.current.conversations) s.emit("conv:join", cid);
      for (const bid of rooms.current.boards) s.emit("board:join", bid);
      if (rooms.current.waInbox) s.emit("wa:inbox:join");
      for (const cid of rooms.current.waConversations)
        s.emit("wa:conv:join", cid);
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", (err) => {
      connectErrorCount++;
      // Log only the first 2 failures — after that the cause is clearly
      // infra (service down / proxy misconfigured), and the socket.io client
      // will stop retrying once reconnectionAttempts is exhausted.
      if (connectErrorCount <= 2) {
        console.warn("[realtime] connect_error:", err.message);
      }
    });
    s.on("reconnect_failed", () => {
      console.warn(
        "[realtime] gave up reconnecting. Live updates are disabled; " +
          "the inbox will still work via HTTP refresh.",
      );
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      socket,
      connected,
      joinConversation: (id) => {
        rooms.current.conversations.add(id);
        socket?.emit("conv:join", id);
      },
      leaveConversation: (id) => {
        rooms.current.conversations.delete(id);
        socket?.emit("conv:leave", id);
      },
      joinBoard: (id) => {
        rooms.current.boards.add(id);
        socket?.emit("board:join", id);
      },
      leaveBoard: (id) => {
        rooms.current.boards.delete(id);
        socket?.emit("board:leave", id);
      },
      sendTyping: (conversationId, typing) => {
        socket?.emit("chat:typing", { conversationId, typing });
      },
      joinWhatsAppInbox: () => {
        rooms.current.waInbox = true;
        socket?.emit("wa:inbox:join");
      },
      leaveWhatsAppInbox: () => {
        rooms.current.waInbox = false;
        socket?.emit("wa:inbox:leave");
      },
      joinWhatsAppConversation: (id) => {
        rooms.current.waConversations.add(id);
        socket?.emit("wa:conv:join", id);
      },
      leaveWhatsAppConversation: (id) => {
        rooms.current.waConversations.delete(id);
        socket?.emit("wa:conv:leave", id);
      },
    }),
    [socket, connected],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx)
    throw new Error("useRealtime must be used inside <RealtimeProvider>");
  return ctx;
}

/**
 * Subscribe to a socket event for the lifetime of a component.
 * Safe to call when the socket is not yet connected.
 */
export function useRealtimeEvent<T>(
  event: string,
  handler: (payload: T) => void,
  deps: unknown[] = [],
) {
  const { socket } = useRealtime();
  useEffect(() => {
    if (!socket) return;
    const cb = (p: T) => handler(p);
    socket.on(event, cb);
    return () => {
      socket.off(event, cb);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, event, ...deps]);
}

/** Join a conversation room for the lifetime of a component. */
export function useConversationRoom(conversationId: number | null | undefined) {
  const { joinConversation, leaveConversation } = useRealtime();
  useEffect(() => {
    if (!conversationId) return;
    joinConversation(conversationId);
    return () => leaveConversation(conversationId);
  }, [conversationId, joinConversation, leaveConversation]);
}

/** Join a board room for the lifetime of a component. */
export function useBoardRoom(boardId: number | null | undefined) {
  const { joinBoard, leaveBoard } = useRealtime();
  useEffect(() => {
    if (!boardId) return;
    joinBoard(boardId);
    return () => leaveBoard(boardId);
  }, [boardId, joinBoard, leaveBoard]);
}

/** Join the WhatsApp inbox broadcast room for the lifetime of a component. */
export function useWhatsAppInboxRoom() {
  const { joinWhatsAppInbox, leaveWhatsAppInbox } = useRealtime();
  useEffect(() => {
    joinWhatsAppInbox();
    return () => leaveWhatsAppInbox();
  }, [joinWhatsAppInbox, leaveWhatsAppInbox]);
}

/** Join a specific WhatsApp conversation room for the lifetime of a component. */
export function useWhatsAppConversationRoom(
  conversationId: number | null | undefined,
) {
  const { joinWhatsAppConversation, leaveWhatsAppConversation } = useRealtime();
  useEffect(() => {
    if (!conversationId) return;
    joinWhatsAppConversation(conversationId);
    return () => leaveWhatsAppConversation(conversationId);
  }, [conversationId, joinWhatsAppConversation, leaveWhatsAppConversation]);
}
