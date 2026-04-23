import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET  /api/whatsapp/notification-prefs — return (or create) the caller's
 *      WhatsApp notification preferences (push on/off, sound, scope, quiet hours).
 * PATCH /api/whatsapp/notification-prefs — partial update of the same.
 *
 * Scoped to the signed-in user only; administrators manage their own row here.
 */

const SCOPES = new Set(["all", "mine", "none"]);

function isTime(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export async function GET() {
  let session;
  try {
    session = await requirePermission("whatsapp:view");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const userId = Number((session.user as { id?: string | number }).id);
  const pref = await prisma.whatsAppNotificationPref.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return NextResponse.json(pref);
}

interface PatchBody {
  pushEnabled?: boolean;
  soundEnabled?: boolean;
  soundKey?: string;
  notifyScope?: "all" | "mine" | "none";
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
}

export async function PATCH(req: Request) {
  let session;
  try {
    session = await requirePermission("whatsapp:view");
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    throw e;
  }

  const userId = Number((session.user as { id?: string | number }).id);
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  const data: Record<string, unknown> = {};
  if (typeof body.pushEnabled === "boolean")
    data.pushEnabled = body.pushEnabled;
  if (typeof body.soundEnabled === "boolean")
    data.soundEnabled = body.soundEnabled;
  if (typeof body.soundKey === "string" && body.soundKey.trim())
    data.soundKey = body.soundKey.slice(0, 40);
  if (body.notifyScope && SCOPES.has(body.notifyScope))
    data.notifyScope = body.notifyScope;
  if (body.quietHoursStart === null || isTime(body.quietHoursStart))
    data.quietHoursStart = body.quietHoursStart ?? null;
  if (body.quietHoursEnd === null || isTime(body.quietHoursEnd))
    data.quietHoursEnd = body.quietHoursEnd ?? null;

  const updated = await prisma.whatsAppNotificationPref.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return NextResponse.json(updated);
}
