import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Web Push helper — sends OS-level notifications via the VAPID-signed
 * Push API to every stored `WhatsAppPushSubscription` for a user.
 *
 * The public/private VAPID keys come from env. Generate them once with
 * `npx ts-node scripts/generate-vapid.ts` and paste into `.env`.
 *
 * Subscriptions that return 404/410 are automatically deleted — this is
 * the documented "user unsubscribed from browser" signal.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const CONTACT =
  process.env.VAPID_CONTACT_EMAIL || "mailto:admin@mafhotel.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.warn(
      "[whatsapp/push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — Web Push disabled.",
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

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  contactPhone?: string;
  conversationId?: number;
  messageId?: number;
  /** When true, OS notification will NOT play the system sound. The service
   *  worker still shows the visual toast. */
  silent?: boolean;
}

/**
 * Send a Web Push payload to every registered device/browser for `userId`.
 * Non-fatal — network errors are logged; gone-away subscriptions are pruned.
 */
export async function sendWebPushToUser(
  userId: number,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const subs = await prisma.whatsAppPushSubscription.findMany({
    where: { userId },
  });
  if (!subs.length) return;

  const json = JSON.stringify(payload);
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
          // Subscription gone — prune it.
          removals.push(sub.id);
        } else {
          console.warn(
            `[whatsapp/push] send failed for sub ${sub.id} (status ${statusCode ?? "?"}):`,
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
