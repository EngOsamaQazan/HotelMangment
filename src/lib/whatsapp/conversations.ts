import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Server-side helpers for the WhatsApp CRM inbox.
 *
 * Centralises every write to `WhatsAppContact` / `WhatsAppConversation` so the
 * webhook, the send endpoint, and the phonebook CRUD all stay consistent. Also
 * exposes `findReservationIdByPhone` (moved from the old webhook file).
 */

export interface UpsertContactInput {
  phone: string;
  displayName?: string | null;
  /**
   * Profile name as it appears on the customer's WhatsApp account
   * (`contacts[].profile.name` in the inbound webhook payload).
   * Always refreshed when the webhook fires; never overwrites the manually
   * edited `displayName`.
   */
  waProfileName?: string | null;
  nickname?: string | null;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[];
  source?: string;
  optedIn?: boolean;
  isBlocked?: boolean;
  createdByUserId?: number | null;
  updatedByUserId?: number | null;
}

/** Upsert the phonebook row. Never clobbers a non-null displayName with null. */
export async function upsertContact(input: UpsertContactInput) {
  const now = new Date();
  return prisma.whatsAppContact.upsert({
    where: { phone: input.phone },
    create: {
      phone: input.phone,
      displayName: input.displayName ?? null,
      waProfileName: input.waProfileName ?? null,
      nickname: input.nickname ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
      source: input.source ?? "whatsapp",
      optedIn: input.optedIn ?? false,
      isBlocked: input.isBlocked ?? false,
      lastSeenAt: now,
      lastMessageAt: now,
      createdByUserId: input.createdByUserId ?? null,
      updatedByUserId: input.updatedByUserId ?? input.createdByUserId ?? null,
    },
    update: {
      displayName: input.displayName ?? undefined,
      waProfileName: input.waProfileName ?? undefined,
      nickname: input.nickname ?? undefined,
      email: input.email ?? undefined,
      company: input.company ?? undefined,
      notes: input.notes ?? undefined,
      tags: input.tags ?? undefined,
      source: input.source ?? undefined,
      optedIn: input.optedIn ?? undefined,
      isBlocked: input.isBlocked ?? undefined,
      lastSeenAt: now,
      updatedByUserId: input.updatedByUserId ?? undefined,
    },
  });
}

/**
 * Get-or-create a conversation row and update the last-message timestamp +
 * unread counter. Auto-reopens resolved/archived threads when a new inbound
 * arrives (classic Intercom/Front behaviour).
 */
export async function upsertConversationForInbound(
  phone: string,
  messageAt: Date,
  contactId: number,
) {
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { contactPhone: phone },
  });

  if (!existing) {
    return prisma.whatsAppConversation.create({
      data: {
        contactPhone: phone,
        contactId,
        status: "open",
        priority: "normal",
        lastMessageAt: messageAt,
        firstInboundAt: messageAt,
        unreadCount: 1,
      },
    });
  }

  const becameReopened =
    existing.status === "resolved" || existing.status === "archived";

  return prisma.whatsAppConversation.update({
    where: { id: existing.id },
    data: {
      contactId: existing.contactId ?? contactId,
      lastMessageAt: messageAt,
      firstInboundAt: existing.firstInboundAt ?? messageAt,
      unreadCount: { increment: 1 },
      status: becameReopened ? "open" : existing.status,
    },
  });
}

/** Same helper but for outbound sends — does NOT bump unreadCount. */
export async function upsertConversationForOutbound(
  phone: string,
  messageAt: Date,
  contactId: number,
  sentByUserId: number | null,
) {
  const existing = await prisma.whatsAppConversation.findUnique({
    where: { contactPhone: phone },
  });

  if (!existing) {
    return prisma.whatsAppConversation.create({
      data: {
        contactPhone: phone,
        contactId,
        status: "open",
        priority: "normal",
        lastMessageAt: messageAt,
        assignedToUserId: sentByUserId ?? null,
        assignedAt: sentByUserId ? messageAt : null,
        assignedByUserId: sentByUserId ?? null,
      },
    });
  }

  const firstResponse =
    existing.firstInboundAt && !existing.firstResponseAt
      ? messageAt
      : existing.firstResponseAt;

  return prisma.whatsAppConversation.update({
    where: { id: existing.id },
    data: {
      contactId: existing.contactId ?? contactId,
      lastMessageAt: messageAt,
      firstResponseAt: firstResponse,
    },
  });
}

/** Best-effort reservation linkage by the last 9 phone digits. */
export async function findReservationIdByPhone(
  phone: string,
): Promise<number | null> {
  if (!phone) return null;
  const tail = phone.slice(-9);
  const row = await prisma.reservation.findFirst({
    where: { phone: { contains: tail } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}
