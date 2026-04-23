import "server-only";
import { prisma } from "@/lib/prisma";

/** Normalize a dynamic [phone] route segment into digits-only. */
export function normalizeRoutePhone(raw: string | string[] | undefined): string {
  const s = Array.isArray(raw) ? raw[0] : raw ?? "";
  return String(s).replace(/\D/g, "").trim();
}

/**
 * Fetch a conversation by phone, or upsert it on the fly if the phonebook
 * row already exists (so we can assign/tag a thread before the first inbound).
 *
 * Returns `null` if neither a conversation nor a contact exists — callers
 * should 404 in that case.
 */
export async function getOrCreateConversationByPhone(phone: string) {
  if (!phone) return null;

  const existing = await prisma.whatsAppConversation.findUnique({
    where: { contactPhone: phone },
    include: { contact: true },
  });
  if (existing) return existing;

  const contact = await prisma.whatsAppContact.findUnique({
    where: { phone },
  });
  if (!contact) return null;

  const created = await prisma.whatsAppConversation.create({
    data: {
      contactPhone: phone,
      contactId: contact.id,
      status: "open",
      priority: "normal",
    },
    include: { contact: true },
  });
  return created;
}

/** Record an audit entry on the conversation timeline. */
export async function logConversationEvent(
  conversationId: number,
  action: string,
  actorUserId: number | null,
  meta?: Record<string, unknown> | null,
): Promise<void> {
  await prisma.whatsAppConversationEvent.create({
    data: {
      conversationId,
      action,
      actorUserId,
      meta: (meta ?? undefined) as unknown as object,
    },
  });
}
