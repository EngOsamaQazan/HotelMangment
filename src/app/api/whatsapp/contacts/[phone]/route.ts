import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { normalizeRoutePhone } from "@/lib/whatsapp/convHelpers";
import { pgNotify } from "@/lib/realtime/notify";

interface Ctx {
  params: Promise<{ phone: string }>;
}

/**
 * GET    /api/whatsapp/contacts/[phone] — single contact with linked conversation.
 * PATCH  /api/whatsapp/contacts/[phone] — partial update (profile / tags / block).
 * DELETE /api/whatsapp/contacts/[phone] — delete (requires `whatsapp:manage_contacts`).
 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    try {
      await requirePermission("whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);

    const contact = await prisma.whatsAppContact.findUnique({
      where: { phone },
      include: {
        conversation: {
          select: {
            id: true,
            status: true,
            priority: true,
            unreadCount: true,
            assignedToUserId: true,
          },
        },
      },
    });
    if (!contact)
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    return NextResponse.json(contact);
  } catch (err) {
    console.error("[GET /api/whatsapp/contacts/[phone]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل جهة الاتصال" },
      { status: 500 },
    );
  }
}

interface PatchBody {
  displayName?: string | null;
  nickname?: string | null;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown> | null;
  optedIn?: boolean;
  isBlocked?: boolean;
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:manage_contacts");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);
    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const userId = Number((session.user as { id?: string | number }).id);

    const data: Prisma.WhatsAppContactUpdateInput = {
      updatedBy: { connect: { id: userId } },
    };
    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.nickname !== undefined) data.nickname = body.nickname;
    if (body.email !== undefined) data.email = body.email;
    if (body.company !== undefined) data.company = body.company;
    if (body.notes !== undefined) data.notes = body.notes;
    if (Array.isArray(body.tags)) data.tags = body.tags;
    if (body.customFields !== undefined)
      data.customFields =
        body.customFields === null
          ? Prisma.JsonNull
          : (body.customFields as Prisma.InputJsonValue);
    if (typeof body.optedIn === "boolean") data.optedIn = body.optedIn;
    if (typeof body.isBlocked === "boolean") data.isBlocked = body.isBlocked;

    const updated = await prisma.whatsAppContact.update({
      where: { phone },
      data,
    });

    await pgNotify("wa_events", {
      op: "contact:update",
      contactId: updated.id,
      contactPhone: updated.phone,
      displayName: updated.displayName,
      tags: updated.tags,
      isBlocked: updated.isBlocked,
    });

    return NextResponse.json(updated);
  } catch (err) {
    if ((err as { code?: string }).code === "P2025")
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    console.error("[PATCH /api/whatsapp/contacts/[phone]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحديث جهة الاتصال" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    try {
      await requirePermission("whatsapp:manage_contacts");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const { phone: rawPhone } = await ctx.params;
    const phone = normalizeRoutePhone(rawPhone);

    // Detach the contact from any conversation first (FK = SetNull).
    const contact = await prisma.whatsAppContact.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!contact)
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });

    await prisma.whatsAppContact.delete({ where: { phone } });

    await pgNotify("wa_events", {
      op: "contact:update",
      contactId: contact.id,
      contactPhone: phone,
      deleted: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/whatsapp/contacts/[phone]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر الحذف" },
      { status: 500 },
    );
  }
}
