import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { loadBotConfig, updateBotConfig, type UpdateBotConfigInput } from "@/lib/whatsapp/bot/config";

/**
 * GET  /api/whatsapp/bot/config — read public-safe view (no decrypted secrets).
 * PUT  /api/whatsapp/bot/config — patch fields. Empty secret strings preserve
 *                                 the stored value.
 */
export async function GET() {
  try {
    try {
      await requirePermission("whatsapp.bot:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const cfg = await loadBotConfig();
    return NextResponse.json(cfg);
  } catch (err) {
    console.error("[GET /api/whatsapp/bot/config]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل إعدادات البوت" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  try {
    try {
      await requirePermission("whatsapp.bot:configure");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const body = (await req.json()) as UpdateBotConfigInput;
    const cfg = await updateBotConfig(body);
    return NextResponse.json(cfg);
  } catch (err) {
    console.error("[PUT /api/whatsapp/bot/config]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر حفظ إعدادات البوت" },
      { status: 500 },
    );
  }
}
