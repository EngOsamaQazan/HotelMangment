import "server-only";
import {
  getVapidPublicKey as getVapidPublicKeyShared,
  sendBrandedPush,
  type BrandedPushPayload,
} from "@/lib/push/server";

/**
 * Thin compatibility shim around `src/lib/push/server.ts` for historical
 * callers in the WhatsApp module. New code should import from `@/lib/push/server`
 * directly and pass an explicit `module: "whatsapp"` so the right actions and
 * branding defaults apply.
 */

export function getVapidPublicKey(): string {
  return getVapidPublicKeyShared();
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  image?: string;
  contactPhone?: string;
  conversationId?: number;
  messageId?: number;
  silent?: boolean;
}

/**
 * Legacy signature used across the WhatsApp fan-out. Forwards to the
 * branded helper with module="whatsapp" so quick-reply actions and the
 * hotel branding kick in automatically.
 */
export async function sendWebPushToUser(
  userId: number,
  payload: PushPayload,
): Promise<void> {
  const branded: BrandedPushPayload = {
    module: "whatsapp",
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    image: payload.image,
    silent: payload.silent,
    data: {
      contactPhone: payload.contactPhone ?? null,
      conversationId: payload.conversationId ?? null,
      messageId: payload.messageId ?? null,
    },
  };
  await sendBrandedPush(userId, branded);
}
