import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleAuthError,
  hasPermission,
  ForbiddenError,
} from "@/lib/permissions/guard";
import { pgNotify } from "@/lib/realtime/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/whatsapp/messages/[id]
 *   Edits the body of an INTERNAL NOTE message. WhatsApp Cloud API does not
 *   expose a real "edit message" endpoint for business senders — once a
 *   message has been pushed to Meta the customer's device keeps the original
 *   forever. We therefore restrict edits to rows with `isInternalNote=true`
 *   (which are never sent to Meta in the first place).
 *
 *   Body: { body: string }
 *
 * DELETE /api/whatsapp/messages/[id]
 *   Soft-deletes a message from the staff inbox view. Sets `deletedAt` /
 *   `deletedByUserId` so the row stays for audit but stops contributing to
 *   conversation previews. The CUSTOMER'S WhatsApp app still shows the
 *   original message — Meta does not allow business-side recall.
 */

async function loadOwnedMessage(id: number) {
  return prisma.whatsAppMessage.findUnique({
    where: { id },
    select: {
      id: true,
      direction: true,
      type: true,
      body: true,
      originalBody: true,
      conversationId: true,
      contactPhone: true,
      isInternalNote: true,
      sentByUserId: true,
      deletedAt: true,
      conversation: {
        select: { assignedToUserId: true },
      },
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:edit_message");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const userId = Number((session.user as { id?: string | number }).id);

    const { id: rawId } = await ctx.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }

    const payload = (await req.json().catch(() => ({}))) as { body?: string };
    const newBody = String(payload.body ?? "").trim();
    if (!newBody) {
      return NextResponse.json(
        { error: "النص الجديد مطلوب" },
        { status: 400 },
      );
    }
    if (newBody.length > 4096) {
      return NextResponse.json(
        { error: "النص طويل جداً (الحد 4096 حرفاً)" },
        { status: 400 },
      );
    }

    const msg = await loadOwnedMessage(id);
    if (!msg || msg.deletedAt) {
      return NextResponse.json(
        { error: "الرسالة غير موجودة أو محذوفة" },
        { status: 404 },
      );
    }

    if (!msg.isInternalNote) {
      return NextResponse.json(
        {
          error:
            "تعذّر التعديل — لا يمكن تعديل الرسائل المُرسَلة للعميل لأن WhatsApp لا يدعم ذلك من جهة العمل. التعديل متاح فقط للملاحظات الداخلية.",
        },
        { status: 422 },
      );
    }

    // Ownership / assignment check: only the original author or a
    // user with `whatsapp:assign` (manager) may edit.
    const isAuthor = msg.sentByUserId === userId;
    const isAssignee = msg.conversation?.assignedToUserId === userId;
    if (
      !isAuthor &&
      !isAssignee &&
      !(await hasPermission(userId, "whatsapp:assign"))
    ) {
      throw new ForbiddenError(
        "لا يمكنك تعديل ملاحظة لم تُنشئها — اطلب من المسؤول.",
      );
    }

    // Preserve the very first version of `body` for staff audit. After the
    // first edit `originalBody` stays locked — subsequent edits only mutate
    // `body` + `editedAt`.
    const updated = await prisma.whatsAppMessage.update({
      where: { id },
      data: {
        body: newBody,
        editedAt: new Date(),
        editedByUserId: userId,
        ...(msg.originalBody == null ? { originalBody: msg.body } : {}),
      },
      select: {
        id: true,
        body: true,
        editedAt: true,
        editedByUserId: true,
        conversationId: true,
        contactPhone: true,
      },
    });

    await pgNotify("wa_events", {
      op: "message:edit",
      messageId: updated.id,
      conversationId: updated.conversationId,
      contactPhone: updated.contactPhone,
      body: updated.body,
      editedAt: updated.editedAt?.toISOString() ?? null,
      editedByUserId: updated.editedByUserId,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      id: updated.id,
      body: updated.body,
      editedAt: updated.editedAt,
    });
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    console.error("[PATCH /api/whatsapp/messages/[id]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تعديل الرسالة" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    let session;
    try {
      session = await requirePermission("whatsapp:delete_message");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const userId = Number((session.user as { id?: string | number }).id);

    const { id: rawId } = await ctx.params;
    const id = Number(rawId);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "معرف غير صالح" }, { status: 400 });
    }

    const msg = await loadOwnedMessage(id);
    if (!msg) {
      return NextResponse.json(
        { error: "الرسالة غير موجودة" },
        { status: 404 },
      );
    }
    if (msg.deletedAt) {
      // Idempotent — already deleted.
      return NextResponse.json({ ok: true, id });
    }

    // Outbound non-note messages: ownership check (author or manager).
    // Inbound + notes: any user with the permission may hide.
    if (msg.direction === "outbound" && !msg.isInternalNote) {
      const isAuthor = msg.sentByUserId === userId;
      const isAssignee = msg.conversation?.assignedToUserId === userId;
      if (
        !isAuthor &&
        !isAssignee &&
        !(await hasPermission(userId, "whatsapp:assign"))
      ) {
        throw new ForbiddenError(
          "لا يمكنك حذف رسالة لم تُرسلها بنفسك — تواصل مع المسؤول.",
        );
      }
    }

    await prisma.whatsAppMessage.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByUserId: userId,
      },
    });

    await pgNotify("wa_events", {
      op: "message:delete",
      messageId: id,
      conversationId: msg.conversationId,
      contactPhone: msg.contactPhone,
      deletedByUserId: userId,
    }).catch(() => {});

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const auth = handleAuthError(err);
    if (auth) return auth;
    console.error("[DELETE /api/whatsapp/messages/[id]]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر حذف الرسالة" },
      { status: 500 },
    );
  }
}
