import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  EVENTS,
  CATEGORY_LABELS,
  listCategories,
} from "@/lib/notifications/events";
import { CHANNELS } from "@/lib/notifications/channels";

/**
 * GET /api/notifications/events
 *
 * Returns the static event + channel + category catalogs used by the
 * preferences page. Read-only — no DB access. Available to anyone with
 * the basic notifications:view permission.
 */
export async function GET() {
  try {
    await requirePermission("notifications:view");
    return NextResponse.json({
      events: EVENTS,
      channels: CHANNELS,
      categories: listCategories().map((c) => ({
        key: c,
        ...CATEGORY_LABELS[c],
      })),
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/notifications/events error:", error);
    return NextResponse.json(
      { error: "فشل تحميل قاموس الأحداث" },
      { status: 500 },
    );
  }
}
