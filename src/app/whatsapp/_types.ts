/** Shared types for the WhatsApp inbox UI. */

export interface ConversationSummary {
  id: number;
  contactPhone: string;
  contact: {
    id: number;
    displayName: string | null;
    nickname: string | null;
    company: string | null;
    tags: string[];
    isBlocked: boolean;
  } | null;
  assignedTo: { id: number; name: string } | null;
  assignedToUserId: number | null;
  status: "open" | "resolved" | "archived";
  priority: "low" | "normal" | "high" | "urgent";
  isMuted: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessage:
    | {
        id: number;
        direction: "inbound" | "outbound";
        type: string;
        body: string | null;
        status: string;
        createdAt: string;
        isInternalNote: boolean;
      }
    | null;
}

export interface Message {
  id: number;
  direction: "inbound" | "outbound";
  contactPhone: string;
  contactName: string | null;
  type: string;
  body: string | null;
  templateName: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  isInternalNote?: boolean;
  /** Meta media id — present for image/video/audio/document/sticker. */
  mediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
  mediaSize?: number | null;
}

export interface TemplateRow {
  id: number;
  name: string;
  language: string;
  category: string;
  status: string;
}

export interface ConversationNote {
  id: number;
  conversationId: number;
  body: string;
  createdAt: string;
  author: { id: number; name: string };
}

export interface ConversationEvent {
  id: number;
  action: string;
  createdAt: string;
  meta: Record<string, unknown> | null;
  actor: { id: number; name: string } | null;
}

export interface ContactDetail {
  id: number;
  phone: string;
  displayName: string | null;
  nickname: string | null;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string[];
  customFields: Record<string, unknown> | null;
  source: string;
  optedIn: boolean;
  isBlocked: boolean;
  lastSeenAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  conversation?: {
    id: number;
    status: string;
    priority: string;
    unreadCount: number;
    assignedToUserId: number | null;
  } | null;
}

export type ScopeFilter = "all" | "mine" | "unassigned";
export type StatusFilter = "open" | "resolved" | "archived" | "any";
