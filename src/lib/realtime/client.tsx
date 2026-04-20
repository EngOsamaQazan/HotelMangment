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

interface RealtimeContextValue {
  socket: Socket | null;
  connected: boolean;
  joinConversation: (id: number) => void;
  leaveConversation: (id: number) => void;
  joinBoard: (id: number) => void;
  leaveBoard: (id: number) => void;
  sendTyping: (conversationId: number, typing: boolean) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const rooms = useRef({ conversations: new Set<number>(), boards: new Set<number>() });

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
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    s.on("connect", () => {
      setConnected(true);
      // Re-join rooms after reconnect.
      for (const cid of rooms.current.conversations) s.emit("conv:join", cid);
      for (const bid of rooms.current.boards) s.emit("board:join", bid);
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", (err) => {
      console.warn("[realtime] connect_error:", err.message);
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
