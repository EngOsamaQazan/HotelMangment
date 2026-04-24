import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/whatsapp/messages
 *   ?contact=962781099910    — list messages with one contact (oldest→newest)
 *   (no contact)             — list distinct threads (most-recent message per contact)
 *   ?limit=50&beforeId=123   — pagination for a thread
 *
 * NOTE: Every branch is wrapped in a top-level try/catch so the client never
 * sees an empty-body 500 (which breaks `res.json()` with "Unexpected end of
 * JSON input"). If anything goes wrong we always return a JSON error.
 */
export async function GET(req: Request) {
  try {
    try {
      await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const url = new URL(req.url);
    const contact = url.searchParams.get("contact");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

    if (contact) {
      const beforeIdRaw = url.searchParams.get("beforeId");
      const beforeId = beforeIdRaw ? Number(beforeIdRaw) : null;

      const rows = await prisma.whatsAppMessage.findMany({
        where: {
          contactPhone: contact,
          ...(beforeId ? { id: { lt: beforeId } } : {}),
        },
        orderBy: { id: "desc" },
        take: limit,
        select: {
          id: true,
          direction: true,
          wamid: true,
          contactPhone: true,
          contactName: true,
          type: true,
          body: true,
          templateName: true,
          status: true,
          errorCode: true,
          errorMessage: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          reservationId: true,
          sentByUserId: true,
          createdAt: true,
          mediaId: true,
          mediaMimeType: true,
          mediaFilename: true,
          mediaSize: true,
          isInternalNote: true,
        },
      });
      return NextResponse.json(rows.reverse());
    }

    // Thread list using DISTINCT ON + GROUP BY aggregate in a single query.
    const rows = await prisma.$queryRaw<
      {
        contact_phone: string;
        contact_name: string | null;
        last_id: number;
        last_body: string | null;
        last_type: string;
        last_direction: string;
        last_status: string;
        last_at: Date;
        unread_count: bigint;
        total_count: bigint;
      }[]
    >`
      WITH latest AS (
        SELECT DISTINCT ON (contact_phone)
          contact_phone,
          id          AS last_id,
          body        AS last_body,
          type        AS last_type,
          direction   AS last_direction,
          status      AS last_status,
          created_at  AS last_at
        FROM whatsapp_messages
        ORDER BY contact_phone, id DESC
      ),
      names AS (
        SELECT DISTINCT ON (contact_phone)
          contact_phone, contact_name
        FROM whatsapp_messages
        WHERE contact_name IS NOT NULL
        ORDER BY contact_phone, id DESC
      ),
      agg AS (
        SELECT
          contact_phone,
          COUNT(*)::bigint AS total_count,
          SUM(CASE WHEN direction = 'inbound' AND status = 'received' THEN 1 ELSE 0 END)::bigint
                           AS unread_count
        FROM whatsapp_messages
        GROUP BY contact_phone
      )
      SELECT
        l.contact_phone,
        n.contact_name,
        l.last_id,
        l.last_body,
        l.last_type,
        l.last_direction,
        l.last_status,
        l.last_at,
        a.unread_count,
        a.total_count
      FROM latest l
      LEFT JOIN names n USING (contact_phone)
      JOIN agg a USING (contact_phone)
      ORDER BY l.last_at DESC
      LIMIT ${limit};
    `;

    return NextResponse.json(
      rows.map((r) => ({
        contactPhone: r.contact_phone,
        contactName: r.contact_name,
        lastId: r.last_id,
        lastBody: r.last_body,
        lastType: r.last_type,
        lastDirection: r.last_direction,
        lastStatus: r.last_status,
        lastAt: r.last_at,
        unreadCount: Number(r.unread_count ?? 0),
        totalCount: Number(r.total_count ?? 0),
      })),
    );
  } catch (err) {
    console.error("[GET /api/whatsapp/messages]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل المحادثات" },
      { status: 500 },
    );
  }
}
