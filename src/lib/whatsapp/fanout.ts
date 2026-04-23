import "server-only";
import { prisma } from "@/lib/prisma";
import { pgNotify } from "@/lib/realtime/notify";
import { sendWebPushToUser } from "@/lib/whatsapp/push-server";

/**
 * Inbound-message fan-out pipeline.
 *
 * Given a freshly-stored inbound `WhatsAppMessage`, this:
 *  1. Picks the set of staff users that should be notified (based on
 *     conversation assignment + per-user `notifyScope` preference).
 *  2. Inserts a row in the shared `Notification` inbox for each target.
 *  3. Fires `pg_notify('wa_events', ...)` so Socket.IO tabs update live.
 *  4. Sends a Web Push payload to every stored subscription for the targets
 *     (so the OS shows a notification even when the browser tab is closed).
 *
 * Failure modes are logged but never thrown — the webhook must always return
 * 200 to Meta.
 */

export interface FanoutMessageInput {
  messageId: number;
  conversationId: number;
  contactPhone: string;
  contactName: string | null;
  body: string | null;
  type: string;
  createdAt: Date;
}

function isWithinQuietHours(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  // Handles windows that cross midnight, e.g. 22:00 → 07:00.
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

async function computeTargetUserIds(conversationId: number): Promise<number[]> {
  const conv = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: { assignedToUserId: true, isMuted: true },
  });
  if (!conv || conv.isMuted) return [];

  // Candidate pool: everyone who has at least `whatsapp:view`.
  const candidatePerms = await prisma.rolePermission.findMany({
    where: { permission: { key: "whatsapp:view", isActive: true } },
    select: {
      role: {
        select: {
          users: { select: { userId: true } },
        },
      },
    },
  });

  const allViewerIds = new Set<number>();
  for (const rp of candidatePerms) {
    for (const ur of rp.role.users) allViewerIds.add(ur.userId);
  }

  // Users with the "assign" permission (managers) always see everything.
  const assignerPerms = await prisma.rolePermission.findMany({
    where: { permission: { key: "whatsapp:assign", isActive: true } },
    select: { role: { select: { users: { select: { userId: true } } } } },
  });
  const managerIds = new Set<number>();
  for (const rp of assignerPerms) {
    for (const ur of rp.role.users) managerIds.add(ur.userId);
  }

  // Per-user preferences decide whether they get notified for unassigned
  // threads or threads that are assigned to someone else.
  const prefs = await prisma.whatsAppNotificationPref.findMany({
    where: { userId: { in: Array.from(allViewerIds) } },
  });
  const prefMap = new Map(prefs.map((p) => [p.userId, p]));

  const targets = new Set<number>();

  if (conv.assignedToUserId) {
    targets.add(conv.assignedToUserId);
    // Managers are always in the loop for assigned threads too.
    for (const mid of managerIds) targets.add(mid);
  } else {
    // Unassigned — anyone with scope "all" gets it; "mine"-only users skip.
    for (const uid of allViewerIds) {
      const pref = prefMap.get(uid);
      const scope = pref?.notifyScope ?? "all";
      if (scope === "all") targets.add(uid);
    }
    // Managers get unassigned-thread alerts regardless of their scope.
    for (const mid of managerIds) targets.add(mid);
  }

  // Respect per-user quiet hours + push/sound toggles applied later.
  return Array.from(targets);
}

export async function fanoutInboundMessage(input: FanoutMessageInput) {
  try {
    const targetUserIds = await computeTargetUserIds(input.conversationId);

    const title = input.contactName
      ? `واتساب: ${input.contactName}`
      : `واتساب: +${input.contactPhone}`;
    const body = previewForNotification(input);
    const linkUrl = `/whatsapp?contact=${encodeURIComponent(input.contactPhone)}`;

    // Persist a row in the shared Notification bell for each target.
    if (targetUserIds.length) {
      await prisma.notification.createMany({
        data: targetUserIds.map((uid) => ({
          userId: uid,
          type: "whatsapp.message",
          title,
          body,
          linkUrl,
          payloadJson: {
            conversationId: input.conversationId,
            contactPhone: input.contactPhone,
            messageId: input.messageId,
          } as unknown as object,
        })),
      });
    }

    // Live fan-out via pg_notify → realtime microservice → Socket.IO rooms.
    await pgNotify("wa_events", {
      op: "message:new",
      conversationId: input.conversationId,
      contactPhone: input.contactPhone,
      contactName: input.contactName,
      messageId: input.messageId,
      body,
      type: input.type,
      createdAt: input.createdAt.toISOString(),
      targetUserIds,
    });

    // Web Push fan-out (best-effort, respects per-user preferences + quiet hours).
    const prefs = targetUserIds.length
      ? await prisma.whatsAppNotificationPref.findMany({
          where: { userId: { in: targetUserIds } },
        })
      : [];
    const prefMap = new Map(prefs.map((p) => [p.userId, p]));

    await Promise.all(
      targetUserIds.map(async (uid) => {
        const pref = prefMap.get(uid);
        if (pref && pref.pushEnabled === false) return;
        if (pref && isWithinQuietHours(pref.quietHoursStart, pref.quietHoursEnd))
          return;
        await sendWebPushToUser(uid, {
          title,
          body,
          url: linkUrl,
          tag: `wa-${input.contactPhone}`,
          contactPhone: input.contactPhone,
          conversationId: input.conversationId,
          messageId: input.messageId,
          silent: pref?.soundEnabled === false,
        });
      }),
    );
  } catch (err) {
    console.error("[whatsapp/fanout] inbound fan-out failed:", err);
  }
}

/** Pushes a `wa:conversation:update` broadcast. Used on assign/status/etc. */
export async function notifyConversationUpdated(params: {
  conversationId: number;
  contactPhone: string;
  reason: string;
  actorUserId?: number | null;
  extra?: Record<string, unknown>;
}) {
  try {
    await pgNotify("wa_events", {
      op: "conversation:update",
      conversationId: params.conversationId,
      contactPhone: params.contactPhone,
      reason: params.reason,
      actorUserId: params.actorUserId ?? null,
      ...params.extra,
    });
  } catch (err) {
    console.error("[whatsapp/fanout] conversation:update failed:", err);
  }
}

/** Pushes a `wa:message:status` broadcast (sent/delivered/read/failed). */
export async function notifyMessageStatus(params: {
  messageId: number;
  conversationId: number | null;
  contactPhone: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  try {
    await pgNotify("wa_events", {
      op: "message:status",
      messageId: params.messageId,
      conversationId: params.conversationId,
      contactPhone: params.contactPhone,
      status: params.status,
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
    });
  } catch (err) {
    console.error("[whatsapp/fanout] message:status failed:", err);
  }
}

function previewForNotification(input: FanoutMessageInput): string {
  if (input.type === "text") return input.body ?? "";
  if (input.type === "image") return "📷 صورة";
  if (input.type === "document") return `📎 ${input.body ?? "ملف"}`;
  if (input.type === "audio") return "🎵 مقطع صوتي";
  if (input.type === "video") return "🎬 فيديو";
  if (input.type === "sticker") return "🏷️ ملصق";
  if (input.type === "location") return "📍 موقع";
  if (input.type === "reaction") return `💟 ${input.body ?? ""}`;
  if (input.type === "template") return `📋 قالب: ${input.body ?? ""}`;
  return input.body ?? "";
}
