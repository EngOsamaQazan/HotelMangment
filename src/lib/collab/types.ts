/**
 * Shared TypeScript types for the Tasks (Kanban) and Chat UIs.
 *
 * These mirror the shapes returned by the API routes and are kept in one
 * place so the pages/components don't redeclare them inconsistently.
 */

// ─────────────────────────────────────────────────────────────
// Common
// ─────────────────────────────────────────────────────────────

export interface UserLite {
  id: number;
  name: string;
  email?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────

export type TaskPriority = "low" | "med" | "high" | "urgent";

export interface TaskBoardLite {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  ownerId: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: UserLite;
  _count: { tasks: number; members: number };
  members?: { role: string; user: UserLite }[];
}

export interface TaskColumn {
  id: number;
  boardId: number;
  name: string;
  position: number;
  wipLimit: number | null;
  createdAt: string;
}

export interface TaskLabel {
  id: number;
  boardId: number;
  name: string;
  color: string;
}

export interface TaskCard {
  id: number;
  boardId: number;
  columnId: number;
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueAt: string | null;
  startAt: string | null;
  position: number;
  createdById: number;
  archivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: { user: UserLite }[];
  labels: { label: TaskLabel }[];
  checklist?: { id: number; done: boolean }[];
  _count: { checklist: number; comments: number; attachments: number };
}

export interface TaskBoardFull {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  ownerId: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: UserLite;
  columns: TaskColumn[];
  members: { role: string; user: UserLite }[];
  labels: TaskLabel[];
  tasks: TaskCard[];
}

export interface TaskChecklistItem {
  id: number;
  taskId: number;
  text: string;
  done: boolean;
  position: number;
}

export interface TaskComment {
  id: number;
  taskId: number;
  authorId: number;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  author: UserLite;
}

export interface TaskAttachment {
  id: number;
  taskId: number;
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedById: number;
  createdAt: string;
  uploadedBy?: UserLite;
}

export interface TaskActivity {
  id: number;
  taskId: number;
  actorId: number;
  type: string;
  payloadJson: unknown;
  createdAt: string;
  actor: UserLite;
}

// ─────────────────────────────────────────────────────────────
// Chat
// ─────────────────────────────────────────────────────────────

export type ConversationType = "dm" | "group" | "task";

export interface ChatParticipant {
  id: number;
  conversationId: number;
  userId: number;
  role: string;
  lastReadAt: string | null;
  mutedUntil: string | null;
  joinedAt: string;
  leftAt: string | null;
  user: UserLite;
}

export interface ChatMessageAttachment {
  id: number;
  messageId: number;
  fileName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  uploadedById: number;
  createdAt: string;
}

export interface ChatReactionRow {
  userId: number;
  emoji: string;
}

export interface ChatReplySnippet {
  id: number;
  body: string;
  deletedAt: string | null;
  sender: { id: number; name: string; avatarUrl?: string | null };
}

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderId: number;
  body: string;
  replyToId: number | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: UserLite;
  attachments: ChatMessageAttachment[];
  reactions: ChatReactionRow[];
  replyTo?: ChatReplySnippet | null;
}

export interface ChatConversation {
  id: number;
  type: ConversationType;
  title: string | null;
  taskId: number | null;
  createdById: number;
  createdAt: string;
  lastMessageAt: string | null;
  participants: ChatParticipant[];
  task?: { id: number; title: string; boardId: number } | null;
  lastMessage?:
    | (Pick<ChatMessage, "id" | "body" | "createdAt" | "senderId"> & {
        sender: { id: number; name: string; avatarUrl?: string | null };
      })
    | null;
  unreadCount?: number;
}

// ─────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────

export interface NotificationItem {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  payloadJson: unknown;
  readAt: string | null;
  createdAt: string;
}
