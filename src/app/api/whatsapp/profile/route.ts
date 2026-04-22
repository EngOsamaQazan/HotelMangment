import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  getBusinessProfile,
  updateBusinessProfile,
  isWhatsAppApiError,
  type BusinessProfileUpdate,
} from "@/lib/whatsapp/client";

/** GET /api/whatsapp/profile — read current WhatsApp Business Profile. */
export async function GET() {
  try {
    try {
      await requirePermission("settings.whatsapp:view");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }
    try {
      const profile = await getBusinessProfile();
      return NextResponse.json(profile);
    } catch (err) {
      const apiErr = isWhatsAppApiError(err) ? err : null;
      return NextResponse.json(
        { error: apiErr?.message ?? (err as Error).message ?? "تعذّر جلب الملف" },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    console.error("[GET /api/whatsapp/profile]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر جلب الملف" },
      { status: 500 },
    );
  }
}

interface PutBody {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  vertical?: string;
  websites?: string[] | string;
}

/** PUT /api/whatsapp/profile — update text fields on the profile. */
export async function PUT(req: Request) {
  try {
    try {
      await requirePermission("settings.whatsapp:edit");
    } catch (e) {
      const res = handleAuthError(e);
      if (res) return res;
      throw e;
    }

    const body = (await req.json().catch(() => ({}))) as PutBody;
    const update: BusinessProfileUpdate = {};
    if (typeof body.about === "string") update.about = body.about.slice(0, 139);
    if (typeof body.address === "string")
      update.address = body.address.slice(0, 256);
    if (typeof body.description === "string")
      update.description = body.description.slice(0, 512);
    if (typeof body.email === "string") update.email = body.email.slice(0, 128);
    if (typeof body.vertical === "string" && body.vertical.trim())
      update.vertical = body.vertical.trim();
    if (body.websites !== undefined) {
      const arr = Array.isArray(body.websites)
        ? body.websites
        : String(body.websites)
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
      update.websites = arr.slice(0, 2);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 });
    }

    try {
      await updateBusinessProfile(update);
      const fresh = await getBusinessProfile();
      return NextResponse.json({ ok: true, profile: fresh });
    } catch (err) {
      const apiErr = isWhatsAppApiError(err) ? err : null;
      return NextResponse.json(
        {
          error: apiErr?.message ?? (err as Error).message ?? "تعذّر تحديث الملف",
          code: apiErr?.code,
        },
        { status: apiErr?.status ?? 502 },
      );
    }
  } catch (err) {
    console.error("[PUT /api/whatsapp/profile]", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "تعذّر تحديث الملف" },
      { status: 500 },
    );
  }
}
