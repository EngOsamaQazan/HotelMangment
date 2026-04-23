"use client";

import { useEffect, useRef } from "react";
import {
  useRealtime,
  useWhatsAppInboxRoom,
  useWhatsAppConversationRoom,
  type WhatsAppMessagePayload,
  type WhatsAppConversationPayload,
  type WhatsAppContactPayload,
} from "@/lib/realtime/client";

export interface UseWhatsAppRealtimeOptions {
  /** Currently open conversation id — its messages room is joined too. */
  conversationId?: number | null;
  /** Fires on every new inbound or outbound message (`message:new`). */
  onMessageNew?: (p: WhatsAppMessagePayload) => void;
  /** Fires on `message:status` (sent → delivered → read / failed). */
  onMessageStatus?: (p: WhatsAppMessagePayload) => void;
  /** Fires whenever any conversation in the inbox changes: assign, priority,
   *  status, unread counter bumps, read receipts, etc. */
  onConversationUpdate?: (p: WhatsAppConversationPayload) => void;
  /** Fires when a contact row is edited, blocked, or tagged. */
  onContactUpdate?: (p: WhatsAppContactPayload) => void;
  /** Fires when a push lands on this tab via the Service Worker.
   *  Useful for playing the in-app sound / flashing the tab title without
   *  duplicating logic between the SW and the live tab. */
  onTabPush?: (p: Record<string, unknown>) => void;
}

/**
 * One-stop hook for the WhatsApp UI layer. Joins both rooms, attaches every
 * wa:* socket listener, and listens for `WA_PUSH` / `WA_OPEN_CONVERSATION`
 * messages from `public/sw.js`. Callbacks are read from a ref so callers can
 * pass inline lambdas without causing re-subscription storms.
 */
export function useWhatsAppRealtime(opts: UseWhatsAppRealtimeOptions) {
  const { socket } = useRealtime();
  useWhatsAppInboxRoom();
  useWhatsAppConversationRoom(opts.conversationId ?? null);

  const cbRef = useRef(opts);
  cbRef.current = opts;

  useEffect(() => {
    if (!socket) return;

    const onMsgNew = (p: WhatsAppMessagePayload) =>
      cbRef.current.onMessageNew?.(p);
    const onMsgStatus = (p: WhatsAppMessagePayload) =>
      cbRef.current.onMessageStatus?.(p);
    const onConvUpdate = (p: WhatsAppConversationPayload) =>
      cbRef.current.onConversationUpdate?.(p);
    const onInboxUpdate = (
      p: WhatsAppMessagePayload | WhatsAppConversationPayload,
    ) => {
      if (p.op === "conversation:update")
        cbRef.current.onConversationUpdate?.(p);
      else if (p.op === "message:new") cbRef.current.onMessageNew?.(p);
      else if (p.op === "message:status") cbRef.current.onMessageStatus?.(p);
    };
    const onContact = (p: WhatsAppContactPayload) =>
      cbRef.current.onContactUpdate?.(p);
    const onNotify = (p: WhatsAppMessagePayload) =>
      cbRef.current.onMessageNew?.(p);

    socket.on("wa:message:new", onMsgNew);
    socket.on("wa:message:status", onMsgStatus);
    socket.on("wa:conversation:update", onConvUpdate);
    socket.on("wa:inbox:update", onInboxUpdate);
    socket.on("wa:contact:update", onContact);
    socket.on("wa:notify", onNotify);

    return () => {
      socket.off("wa:message:new", onMsgNew);
      socket.off("wa:message:status", onMsgStatus);
      socket.off("wa:conversation:update", onConvUpdate);
      socket.off("wa:inbox:update", onInboxUpdate);
      socket.off("wa:contact:update", onContact);
      socket.off("wa:notify", onNotify);
    };
  }, [socket]);

  // Service Worker → tab messages (web-push relay for in-app UX).
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as
        | { type: "WA_PUSH"; payload: Record<string, unknown> }
        | { type: "WA_OPEN_CONVERSATION"; contactPhone: string | null }
        | null;
      if (!data) return;
      if (data.type === "WA_PUSH") {
        cbRef.current.onTabPush?.(data.payload ?? {});
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);
}
