import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  getConversationalAutomation,
  updateConversationalAutomation,
  isWhatsAppApiError,
  type ConversationalAutomation,
} from "@/lib/whatsapp/client";

/**
 * GET  /api/whatsapp/automation — current greeting / commands / prompts.
 * PUT  /api/whatsapp/automation — replace them at Meta.
 *
 * "Conversational automation" = the welcome message + slash-commands +
 * ice-breaker prompts users see when they open a WhatsApp chat with the
 * business for the first time within 24 hours.
 */
export async function GET() {
  try {
    await requirePermission("settings.whatsapp:view");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const data = await getConversationalAutomation();
    return NextResponse.json(data);
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر التحميل" },
      { status: apiErr?.status ?? 502 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await requirePermission("settings.whatsapp:edit");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ConversationalAutomation;

    // Light validation — Meta will reject invalid shapes, but failing fast
    // here avoids round-trips for obvious mistakes.
    if (body.commands && body.commands.length > 30) {
      return NextResponse.json(
        { error: "الحدّ الأقصى للأوامر 30" },
        { status: 400 },
      );
    }
    if (body.prompts && body.prompts.length > 4) {
      return NextResponse.json(
        { error: "الحدّ الأقصى لعبارات البدء (Ice-breakers) 4" },
        { status: 400 },
      );
    }

    await updateConversationalAutomation(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    return NextResponse.json(
      { error: apiErr?.message ?? (err as Error).message ?? "تعذّر الحفظ" },
      { status: apiErr?.status ?? 502 },
    );
  }
}
