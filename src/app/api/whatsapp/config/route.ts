import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  loadPublicConfig,
  updateConfig,
  type UpdateConfigInput,
} from "@/lib/whatsapp/config";

/** GET /api/whatsapp/config — safe view (no secrets). */
export async function GET() {
  try {
    try {
      await requirePermission("settings.whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    const cfg = await loadPublicConfig();
    return NextResponse.json(cfg);
  } catch (err) {
    console.error("[GET /api/whatsapp/config]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحميل الإعدادات" },
      { status: 500 },
    );
  }
}

/** PUT /api/whatsapp/config — update fields. Empty secret strings are ignored. */
export async function PUT(req: Request) {
  try {
    try {
      await requirePermission("settings.whatsapp:edit");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json()) as UpdateConfigInput;
    await updateConfig(body);
    const cfg = await loadPublicConfig();
    return NextResponse.json(cfg);
  } catch (err) {
    console.error("[PUT /api/whatsapp/config]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر حفظ الإعدادات" },
      { status: 500 },
    );
  }
}
