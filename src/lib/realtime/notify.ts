import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Fire a pg_notify event from Next.js API routes. The realtime Socket.IO
 * service (separate PM2 process) LISTENs on these channels and fans out
 * to connected clients via rooms.
 *
 * This is used for events that DB triggers can't easily express in one
 * statement (multi-row updates, assignee changes, etc.). For simple cases,
 * the triggers in prisma/sql/realtime-triggers.sql already handle it.
 */
export async function pgNotify(
  channel: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const json = JSON.stringify(payload);
  await prisma.$executeRawUnsafe(
    `SELECT pg_notify($1, $2)`,
    channel,
    json,
  );
}

/** Broadcast a refresh of a task's full row to all board watchers. */
export async function notifyTaskUpdated(
  taskId: number,
  boardId: number,
  extra: Record<string, unknown> = {},
) {
  await pgNotify("task_events", {
    op: "update",
    taskId,
    boardId,
    ...extra,
  });
}

/** Broadcast a chat event (message/edit/delete) — usually DB trigger covers it. */
export async function notifyChatEvent(
  conversationId: number,
  op: string,
  extra: Record<string, unknown> = {},
) {
  await pgNotify("chat_events", {
    op,
    conversationId,
    ...extra,
  });
}
