import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import {
  getUserPreferences,
  savePreferences,
  summarizePreferences,
  type PreferencePatch,
} from "@/lib/notifications/preferences";
import { CHANNEL_KEYS } from "@/lib/notifications/channels";

/**
 * GET /api/notifications/preferences
 *
 * Returns:
 *   {
 *     prefs: Record<"<eventCode|*>:<channel>", PreferenceRow>,
 *     summary: { activeChannels, activeEvents, totalEvents },
 *   }
 */
export async function GET() {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const [prefs, summary] = await Promise.all([
      getUserPreferences(userId),
      summarizePreferences(userId),
    ]);
    return NextResponse.json({ prefs, summary });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/notifications/preferences error:", error);
    return NextResponse.json(
      { error: "فشل تحميل التفضيلات" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/notifications/preferences
 *   body: { preferences: PreferencePatch[] }
 *
 * Bulk upsert. The frontend collects every dirty toggle/select before
 * calling save and submits the full delta in one trip.
 */
export async function PUT(request: Request) {
  try {
    const session = await requirePermission("notifications:manage_preferences");
    const userId = Number((session.user as { id?: string | number }).id);
    const body = (await request.json().catch(() => ({}))) as {
      preferences?: unknown;
    };

    const raw = Array.isArray(body.preferences) ? body.preferences : [];
    const patches: PreferencePatch[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const row = r as Record<string, unknown>;
      const channel = String(row.channel ?? "");
      if (!CHANNEL_KEYS.includes(channel as never)) continue;
      const eventCode = String(row.eventCode ?? row.event_code ?? "*");
      patches.push({
        eventCode: eventCode || "*",
        channel,
        isEnabled:
          row.isEnabled === true ||
          row.isEnabled === 1 ||
          row.is_enabled === true ||
          row.is_enabled === 1,
        digestMode:
          typeof row.digestMode === "string"
            ? (row.digestMode as string)
            : typeof row.digest_mode === "string"
              ? (row.digest_mode as string)
              : "instant",
        quietHoursStart:
          typeof row.quietHoursStart === "string"
            ? (row.quietHoursStart as string)
            : typeof row.quiet_hours_start === "string"
              ? (row.quiet_hours_start as string)
              : null,
        quietHoursEnd:
          typeof row.quietHoursEnd === "string"
            ? (row.quietHoursEnd as string)
            : typeof row.quiet_hours_end === "string"
              ? (row.quiet_hours_end as string)
              : null,
        timezone:
          typeof row.timezone === "string"
            ? (row.timezone as string)
            : "Asia/Amman",
      });
    }

    await savePreferences(userId, patches);
    const [prefs, summary] = await Promise.all([
      getUserPreferences(userId),
      summarizePreferences(userId),
    ]);
    return NextResponse.json({ ok: true, prefs, summary });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/notifications/preferences error:", error);
    return NextResponse.json(
      { error: "فشل حفظ التفضيلات" },
      { status: 500 },
    );
  }
}
