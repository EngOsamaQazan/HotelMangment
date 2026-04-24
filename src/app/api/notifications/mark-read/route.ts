import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * POST /api/notifications/mark-read
 * body:
 *   { ids: number[] }                                 — specific rows
 *   { all: true }                                     — every row for the user
 *   { contactPhone: "9627XXXXXXXX" }                  — every `whatsapp.message`
 *                                                       row whose payloadJson
 *                                                       carries that phone
 *
 * The `contactPhone` filter is how the WhatsApp inbox keeps the header-bell
 * badge in sync with the per-thread read state: when the user opens a thread
 * the front-end also clears any push/bell notifications that pointed to that
 * same conversation so the count never lingers after the reply.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const body = await request.json().catch(() => ({}));
    const { ids, all, contactPhone } = body as {
      ids?: number[];
      all?: boolean;
      contactPhone?: string;
    };
    if (all) {
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    if (typeof contactPhone === "string" && contactPhone.trim()) {
      const phone = contactPhone.trim();
      // Match both a Postgres JSON filter and a fallback on `link_url` —
      // historical rows occasionally carry the phone in the link but not in
      // payloadJson (older inserts before the field was added).
      await prisma.notification.updateMany({
        where: {
          userId,
          readAt: null,
          OR: [
            {
              type: "whatsapp.message",
              payloadJson: {
                path: ["contactPhone"],
                equals: phone,
              },
            },
            { linkUrl: { contains: `contact=${phone}` } },
          ],
        },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    if (Array.isArray(ids) && ids.length) {
      const uniq = ids.map(Number).filter(Number.isFinite);
      await prisma.notification.updateMany({
        where: { userId, id: { in: uniq }, readAt: null },
        data: { readAt: new Date() },
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "لا توجد معرفات" }, { status: 400 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/notifications/mark-read error:", error);
    return NextResponse.json(
      { error: "فشل تحديث الإشعارات" },
      { status: 500 },
    );
  }
}
