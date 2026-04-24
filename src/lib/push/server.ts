import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Unified, brand-consistent Web Push helper for the entire hotel app.
 *
 * History: Web Push was first introduced for the WhatsApp inbox and its
 * subscription table is called `WhatsAppPushSubscription`. Despite the
 * name the subscriptions themselves are generic — one endpoint per
 * device/browser per user — so we reuse the same table as the delivery
 * substrate for every module (chat, tasks, reservations, maintenance).
 *
 * Module-aware defaults ensure every notification looks like it comes
 * from the same hotel even when the source code that triggered it lives
 * in a totally different route. This is the single point where branding
 * is applied, so you update it once to re-skin the whole fleet.
 *
 * Environment:
 *   - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY  (required)
 *   - VAPID_CONTACT_EMAIL                   (optional, defaults to admin@mafhotel.com)
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const CONTACT =
  process.env.VAPID_CONTACT_EMAIL || "mailto:admin@mafhotel.com";

const HOTEL_BRAND = {
  name: "فندق المفرق",
  icon: "/whatsapp-icon.png",
  badge: "/whatsapp-badge.png",
};

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.warn(
      "[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — Web Push disabled.",
    );
    return false;
  }
  webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string {
  return PUBLIC_KEY;
}

export type PushModule =
  | "whatsapp"
  | "chat"
  | "tasks"
  | "reservations"
  | "maintenance";

/** Action button shown inside the notification. `type: "text"` enables an
 *  inline reply text box on Android Chrome. */
export interface PushAction {
  action: string;
  title: string;
  type?: "button" | "text";
  placeholder?: string;
}

export interface BrandedPushPayload {
  /** Source module — drives the default icon, title prefix, and actions. */
  module: PushModule;
  /** The meaningful message (sender name, task title, reservation code…).
   *  The hotel name is prepended automatically. */
  title: string;
  /** Body preview — kept short; Android truncates around ~120 chars. */
  body: string;
  /** Deep link the notification click should open. */
  url: string;
  /** Grouping key — new pushes with the same tag replace the old one. */
  tag?: string;
  /** Optional large hero image (message preview, guest photo…). Must be a
   *  same-origin or public URL; the browser fetches it with page cookies. */
  image?: string;
  /** Force the OS not to dismiss until user interacts (use sparingly). */
  requireInteraction?: boolean;
  /** Suppress the OS chime/vibration (the SW still shows the toast). */
  silent?: boolean;
  /** Extra data merged into the notification payload — surfaces to the SW
   *  `notificationclick` handler via `event.notification.data`. */
  data?: Record<string, unknown>;
  /** Override default actions for this module. */
  actions?: PushAction[];
}

/**
 * Build the JSON payload the service worker actually receives. Encapsulates
 * all the branding defaults in one place.
 */
function buildPayload(p: BrandedPushPayload): string {
  const title = p.title.startsWith(HOTEL_BRAND.name)
    ? p.title
    : `${HOTEL_BRAND.name} — ${p.title}`;

  const defaultActions: Record<PushModule, PushAction[]> = {
    whatsapp: [
      { action: "reply", title: "ردّ سريع", type: "text", placeholder: "اكتب ردّك..." },
      { action: "open", title: "فتح" },
    ],
    chat: [
      { action: "open", title: "فتح المحادثة" },
      { action: "dismiss", title: "تجاهل" },
    ],
    tasks: [
      { action: "open", title: "فتح المهمّة" },
      { action: "dismiss", title: "لاحقًا" },
    ],
    reservations: [
      { action: "open", title: "عرض الحجز" },
      { action: "dismiss", title: "تجاهل" },
    ],
    maintenance: [
      { action: "open", title: "فتح الطلب" },
      { action: "dismiss", title: "لاحقًا" },
    ],
  };

  return JSON.stringify({
    module: p.module,
    title,
    body: p.body,
    url: p.url,
    tag: p.tag,
    image: p.image,
    icon: HOTEL_BRAND.icon,
    badge: HOTEL_BRAND.badge,
    requireInteraction: p.requireInteraction === true,
    silent: !!p.silent,
    actions: p.actions ?? defaultActions[p.module],
    data: {
      module: p.module,
      url: p.url,
      ...p.data,
    },
  });
}

/**
 * Send a branded push to every registered device for a single user.
 * Non-fatal: network errors are logged, 404/410 subscriptions are pruned.
 */
export async function sendBrandedPush(
  userId: number,
  payload: BrandedPushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await prisma.whatsAppPushSubscription.findMany({
    where: { userId },
  });
  if (!subs.length) return;

  const json = buildPayload(payload);
  const removals: number[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
          { TTL: 60 * 60 },
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          removals.push(sub.id);
        } else {
          console.warn(
            `[push] send failed for sub ${sub.id} (status ${statusCode ?? "?"}):`,
            (err as Error).message,
          );
        }
      }
    }),
  );

  if (removals.length) {
    await prisma.whatsAppPushSubscription.deleteMany({
      where: { id: { in: removals } },
    });
  }
}

/**
 * Fan out a single payload to many users in parallel. Use for "new
 * reservation" / "task created" style broadcasts where every listed user
 * should see the same notification. De-duplicates user ids.
 */
export async function sendBrandedPushToUsers(
  userIds: readonly number[],
  payload: BrandedPushPayload,
): Promise<void> {
  const uniq = Array.from(new Set(userIds.filter((n) => Number.isFinite(n))));
  if (!uniq.length) return;
  await Promise.all(uniq.map((uid) => sendBrandedPush(uid, payload)));
}
