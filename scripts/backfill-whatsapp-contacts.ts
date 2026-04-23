/*
 * Backfill WhatsAppContact + WhatsAppConversation rows from the existing
 * `whatsapp_messages` log, then set `conversationId` on every message.
 *
 * Idempotent — safe to re-run. Designed for the one-time migration to the
 * new CRM-grade inbox described in plans/whatsapp-inbox-overhaul.
 *
 * Run with:  npx ts-node --project tsconfig.scripts.json scripts/backfill-whatsapp-contacts.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[backfill-whatsapp] starting…");

  // 1. Distinct contact phones from messages, with the latest non-null name
  //    and aggregate counters so we get everything in one go.
  const rows = await prisma.$queryRaw<
    {
      contact_phone: string;
      contact_name: string | null;
      last_message_at: Date;
      first_inbound_at: Date | null;
      inbound_unread: bigint;
    }[]
  >`
    WITH names AS (
      SELECT DISTINCT ON (contact_phone)
        contact_phone, contact_name
      FROM whatsapp_messages
      WHERE contact_name IS NOT NULL
      ORDER BY contact_phone, id DESC
    ),
    firsts AS (
      SELECT contact_phone, MIN(created_at) AS first_inbound_at
      FROM whatsapp_messages
      WHERE direction = 'inbound'
      GROUP BY contact_phone
    ),
    agg AS (
      SELECT
        contact_phone,
        MAX(created_at) AS last_message_at,
        SUM(CASE WHEN direction = 'inbound' AND status = 'received' THEN 1 ELSE 0 END)::bigint AS inbound_unread
      FROM whatsapp_messages
      GROUP BY contact_phone
    )
    SELECT
      a.contact_phone,
      n.contact_name,
      a.last_message_at,
      f.first_inbound_at,
      a.inbound_unread
    FROM agg a
    LEFT JOIN names n USING (contact_phone)
    LEFT JOIN firsts f USING (contact_phone)
    ORDER BY a.last_message_at ASC;
  `;

  console.log(`[backfill-whatsapp] ${rows.length} distinct phones in message log`);

  let contactsCreated = 0;
  let conversationsCreated = 0;

  for (const row of rows) {
    const phone = row.contact_phone;

    const contact = await prisma.whatsAppContact.upsert({
      where: { phone },
      create: {
        phone,
        displayName: row.contact_name ?? null,
        source: "whatsapp",
        optedIn: true, // has messaged us → opted-in per Meta policy
        lastSeenAt: row.last_message_at,
        lastMessageAt: row.last_message_at,
      },
      update: {
        displayName: row.contact_name ?? undefined,
        lastMessageAt: row.last_message_at,
        lastSeenAt: row.last_message_at,
      },
    });
    if (contact.createdAt.getTime() === contact.updatedAt.getTime())
      contactsCreated++;

    const conversation = await prisma.whatsAppConversation.upsert({
      where: { contactPhone: phone },
      create: {
        contactPhone: phone,
        contactId: contact.id,
        status: "open",
        priority: "normal",
        lastMessageAt: row.last_message_at,
        firstInboundAt: row.first_inbound_at ?? null,
        unreadCount: Number(row.inbound_unread ?? 0),
      },
      update: {
        contactId: contact.id,
        lastMessageAt: row.last_message_at,
        firstInboundAt: row.first_inbound_at ?? undefined,
        unreadCount: Number(row.inbound_unread ?? 0),
      },
    });
    if (conversation.createdAt.getTime() === conversation.updatedAt.getTime())
      conversationsCreated++;

    // Link every message row for this phone to the conversation.
    await prisma.whatsAppMessage.updateMany({
      where: { contactPhone: phone, conversationId: null },
      data: { conversationId: conversation.id },
    });
  }

  // Also seed contacts from Reservation.phone / GuestAccount.phone that never
  // messaged us — these are "latent" phonebook rows we can reach out to.
  const reservationPhones = await prisma.$queryRaw<{ phone: string; name: string | null; last_at: Date }[]>`
    SELECT DISTINCT ON (regexp_replace(phone, '\\D', '', 'g'))
      regexp_replace(phone, '\\D', '', 'g') AS phone,
      guest_name AS name,
      created_at AS last_at
    FROM reservations
    WHERE phone IS NOT NULL AND length(regexp_replace(phone, '\\D', '', 'g')) >= 9
    ORDER BY regexp_replace(phone, '\\D', '', 'g'), created_at DESC;
  `.catch(() => [] as { phone: string; name: string | null; last_at: Date }[]);

  for (const r of reservationPhones) {
    if (!r.phone) continue;
    await prisma.whatsAppContact.upsert({
      where: { phone: r.phone },
      create: {
        phone: r.phone,
        displayName: r.name ?? null,
        source: "reservation",
        optedIn: false,
      },
      update: {},
    });
  }

  console.log(
    `[backfill-whatsapp] done. contacts+: ${contactsCreated}, conversations+: ${conversationsCreated}, reservation-phones touched: ${reservationPhones.length}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[backfill-whatsapp] fatal:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
