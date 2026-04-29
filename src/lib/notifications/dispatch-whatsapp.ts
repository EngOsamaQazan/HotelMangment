import "server-only";
import { prisma } from "@/lib/prisma";
import { sendText, isWhatsAppApiError } from "@/lib/whatsapp/client";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";

/**
 * Staff WhatsApp delivery adapter — paired with the `whatsapp` channel in
 * `src/lib/notifications/channels.ts`. Plumbed into dispatch sites alongside
 * `sendBrandedPush()` so an enabled "واتساب" toggle in the user's notification
 * preferences actually sends a message to the staff member's personal number.
 *
 * Best-effort: any failure (missing config, missing staff phone, Meta error)
 * is caught + logged. The caller should never await this for correctness —
 * notifications are also persisted in-app and via Web Push.
 *
 * # Caveats (Meta 24-hour rule)
 *
 * WhatsApp Cloud API only allows arbitrary outbound text *inside* the 24-hour
 * "customer service window" — i.e. within 24h of the staff number having sent
 * a message to the business number. Outside that window Meta requires a
 * pre-approved Template (HSM). In practice this means a brand-new staff
 * member who has never messaged the business number will not receive
 * free-form alerts until they do, or until you wire a template here.
 *
 * To extend this with template-based delivery, accept a `templateName` arg
 * and fall back to `sendTemplate()` when `sendText()` returns Meta error
 * code 131047 ("re-engagement message"). Keeping this as plain text for now
 * because a generic template is project-specific.
 */

export interface StaffWhatsAppPayload {
  /** Short subject line — included as the first line of the message. */
  title: string;
  /** Body text. */
  body: string;
  /**
   * Optional deep-link to surface in the message ("افتح الإشعار:"). Will be
   * sent with `preview_url=true` so WhatsApp renders a rich preview if the
   * domain is reachable.
   */
  url?: string | null;
}

export interface StaffWhatsAppResult {
  ok: boolean;
  /** Reason the send was skipped or failed. `null` when ok=true. */
  reason:
    | null
    | "no_phone"
    | "config_missing"
    | "meta_error"
    | "unknown";
  metaErrorCode?: number;
  message?: string;
}

/**
 * Send a single staff-targeted WhatsApp notification.
 *
 * Returns a structured result rather than throwing so the caller can include
 * it in the `/api/notifications/test` response and surface it to the user.
 */
export async function sendStaffWhatsApp(
  userId: number,
  payload: StaffWhatsAppPayload,
): Promise<StaffWhatsAppResult> {
  let phoneRaw: string | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappPhone: true },
    });
    phoneRaw = user?.whatsappPhone ?? null;
  } catch (err) {
    console.warn("[notifications/whatsapp] lookup failed:", err);
    return { ok: false, reason: "unknown", message: (err as Error).message };
  }

  const to = normalizeWhatsAppPhone(phoneRaw);
  if (!to) {
    return { ok: false, reason: "no_phone" };
  }

  const text = formatStaffMessage(payload);

  try {
    await sendText({ to, text, previewUrl: true });
    return { ok: true, reason: null };
  } catch (err) {
    if (isWhatsAppApiError(err)) {
      const code = err.code;
      // 132000+ → template / 24h-window family. Log calmly.
      console.warn(
        `[notifications/whatsapp] Meta refused send to user=${userId} code=${code} status=${err.status}: ${err.message}`,
      );
      return {
        ok: false,
        reason: "meta_error",
        metaErrorCode: code,
        message: err.message,
      };
    }
    // The runtime config is missing or the access token expired — surface
    // a distinct reason so the test endpoint can tell the user.
    const msg = (err as Error)?.message ?? "";
    if (msg.includes("غير مُهيّأ") || msg.includes("not configured")) {
      return { ok: false, reason: "config_missing", message: msg };
    }
    console.warn("[notifications/whatsapp] unexpected error:", err);
    return { ok: false, reason: "unknown", message: msg };
  }
}

function formatStaffMessage(p: StaffWhatsAppPayload): string {
  const parts: string[] = [];
  if (p.title) parts.push(`*${p.title.trim()}*`);
  if (p.body) parts.push(p.body.trim());
  if (p.url) {
    const absolute = toAbsoluteUrl(p.url);
    if (absolute) parts.push(absolute);
  }
  return parts.join("\n\n");
}

function toAbsoluteUrl(url: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (!base) return url.startsWith("/") ? null : url; // relative without base = useless
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}
