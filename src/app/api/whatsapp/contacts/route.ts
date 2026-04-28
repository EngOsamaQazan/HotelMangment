import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { upsertContact } from "@/lib/whatsapp/conversations";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";
import { pgNotify } from "@/lib/realtime/notify";

/**
 * GET /api/whatsapp/contacts
 *   ?search=<q>&tag=<tag>&source=<source>&blocked=1&limit=50&cursor=<id>
 *
 * POST /api/whatsapp/contacts
 *   Body: { phone, displayName?, nickname?, email?, company?, notes?,
 *           tags?, customFields?, optedIn?, isBlocked? }
 *   Requires `whatsapp:manage_contacts`.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

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
    const search = (url.searchParams.get("search") ?? "").trim();
    const tag = (url.searchParams.get("tag") ?? "").trim();
    const source = (url.searchParams.get("source") ?? "").trim();
    const blocked = url.searchParams.get("blocked");
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
      MAX_LIMIT,
    );
    const cursor = url.searchParams.get("cursor");

    const where: Prisma.WhatsAppContactWhereInput = {};
    if (tag) where.tags = { has: tag };
    if (source) where.source = source;
    if (blocked === "1") where.isBlocked = true;
    else if (blocked === "0") where.isBlocked = false;
    if (search) {
      where.OR = [
        { phone: { contains: search } },
        { displayName: { contains: search, mode: "insensitive" } },
        { waProfileName: { contains: search, mode: "insensitive" } },
        { nickname: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.whatsAppContact.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: Number(cursor) }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({
      contacts: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    console.error("[GET /api/whatsapp/contacts]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل جهات الاتصال" },
      { status: 500 },
    );
  }
}

interface CreateBody {
  phone?: string;
  displayName?: string | null;
  nickname?: string | null;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  optedIn?: boolean;
  isBlocked?: boolean;
}

export async function POST(req: Request) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:manage_contacts");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json().catch(() => ({}))) as CreateBody;
    const phone = normalizeWhatsAppPhone(body.phone ?? "");
    if (!phone)
      return NextResponse.json({ error: "رقم هاتف غير صالح" }, { status: 400 });

    const userId = Number((session.user as { id?: string | number }).id);
    const created = await upsertContact({
      phone,
      displayName: body.displayName ?? null,
      nickname: body.nickname ?? null,
      email: body.email ?? null,
      company: body.company ?? null,
      notes: body.notes ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      source: "manual",
      optedIn: body.optedIn ?? false,
      isBlocked: body.isBlocked ?? false,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    if (body.customFields) {
      await prisma.whatsAppContact.update({
        where: { id: created.id },
        data: {
          customFields: body.customFields as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await pgNotify("wa_events", {
      op: "contact:update",
      contactId: created.id,
      contactPhone: created.phone,
      displayName: created.displayName,
      tags: created.tags,
      isBlocked: created.isBlocked,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/whatsapp/contacts]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر إنشاء جهة الاتصال" },
      { status: 500 },
    );
  }
}
