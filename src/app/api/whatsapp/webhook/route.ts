import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateConfig } from "@/lib/whatsapp/config";
import { decryptSecret } from "@/lib/booking/encryption";
import {
  verifyWebhookSignature,
  type WebhookPayload,
  type WebhookInboundMessage,
  type WebhookStatus,
} from "@/lib/whatsapp/client";
import {
  upsertContact,
  upsertConversationForInbound,
  findReservationIdByPhone,
} from "@/lib/whatsapp/conversations";
import {
  fanoutInboundMessage,
  notifyMessageStatus,
} from "@/lib/whatsapp/fanout";
import { runAutoReply } from "@/lib/whatsapp/autoReply";

/**
 * WhatsApp Business Cloud webhook.
 *
 *   GET  — Meta's hub.challenge verification (run once when you subscribe).
 *   POST — inbound messages + delivery/read statuses. Signed with HMAC-SHA256
 *          using the Meta App Secret; we validate that on every call.
 *
 * Allowlisted in `scripts/check-permissions.ts` because it is called by Meta,
 * not an authenticated user. All auth is via the signature + verify token.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const cfg = await getOrCreateConfig();
  const expected = cfg.webhookVerifyToken ?? "";

  if (mode === "subscribe" && token && expected && token === expected) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature =
    req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256");

  const cfg = await getOrCreateConfig();
  const appSecret = cfg.appSecretEnc ? decryptSecret(cfg.appSecretEnc) : "";

  if (!appSecret) {
    console.warn("[whatsapp/webhook] rejecting: App Secret not configured");
    return new NextResponse("not configured", { status: 503 });
  }
  if (!verifyWebhookSignature(raw, signature, appSecret)) {
    console.warn("[whatsapp/webhook] signature mismatch");
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;
        const v = change.value;
        const profileNameByWaId = new Map<string, string>();
        for (const c of v.contacts ?? []) {
          if (c.profile?.name) profileNameByWaId.set(c.wa_id, c.profile.name);
        }

        for (const msg of v.messages ?? []) {
          await handleInbound(msg, profileNameByWaId.get(msg.from) ?? null);
        }
        for (const st of v.statuses ?? []) {
          await handleStatus(st);
        }
      }
    }
  } catch (err) {
    // Never 5xx: Meta will retry forever. Log and swallow.
    console.error("[whatsapp/webhook] handler error:", err);
  }

  // Meta expects 200 as fast as possible.
  return NextResponse.json({ ok: true });
}

// ───────────────────────── handlers ─────────────────────────

async function handleInbound(msg: WebhookInboundMessage, contactName: string | null) {
  const { type, body, template, media } = extractInboundContent(msg);

  // 1. Phonebook: ensure a contact row exists and is up to date.
  const contact = await upsertContact({
    phone: msg.from,
    displayName: contactName,
    source: "whatsapp",
    optedIn: true, // messaging us IS the opt-in per Meta policy
  });

  if (contact.isBlocked) {
    // Still store the message for audit, but skip the fan-out / unread bump.
    await prisma.whatsAppMessage.upsert({
      where: { wamid: msg.id },
      create: {
        direction: "inbound",
        wamid: msg.id,
        contactPhone: msg.from,
        contactName,
        type,
        body,
        templateName: template,
        rawJson: msg as unknown as object,
        status: "received",
        sentAt: new Date(Number(msg.timestamp) * 1000),
        mediaId: media?.id ?? null,
        mediaMimeType: media?.mimeType ?? null,
        mediaFilename: media?.filename ?? null,
        mediaSha256: media?.sha256 ?? null,
      },
      update: { contactName: contactName ?? undefined },
    });
    return;
  }

  // 2. Conversation: upsert + auto-reopen + unread++.
  const messageAt = new Date(Number(msg.timestamp) * 1000);
  const conversation = await upsertConversationForInbound(
    msg.from,
    messageAt,
    contact.id,
  );

  // 3. Best-effort reservation link.
  const reservationId = await findReservationIdByPhone(msg.from);

  // 4. Persist the message row.
  const stored = await prisma.whatsAppMessage.upsert({
    where: { wamid: msg.id },
    create: {
      direction: "inbound",
      wamid: msg.id,
      contactPhone: msg.from,
      contactName,
      type,
      body,
      templateName: template,
      rawJson: msg as unknown as object,
      status: "received",
      reservationId,
      conversationId: conversation.id,
      sentAt: messageAt,
      mediaId: media?.id ?? null,
      mediaMimeType: media?.mimeType ?? null,
      mediaFilename: media?.filename ?? null,
      mediaSha256: media?.sha256 ?? null,
    },
    update: {
      // Idempotency — Meta may redeliver the same message id.
      contactName: contactName ?? undefined,
      conversationId: conversation.id,
    },
  });

  // Bump contact.lastMessageAt so phonebook sort stays fresh.
  await prisma.whatsAppContact.update({
    where: { id: contact.id },
    data: { lastMessageAt: messageAt },
  });

  // 5. Fan-out (notifications + pg_notify + Web Push). Never throws.
  // Passing mediaId through lets the realtime layer render image/video/
  // sticker thumbnails immediately in open tabs instead of falling back
  // to the preview string "📷 صورة" as if it were the message body.
  await fanoutInboundMessage({
    messageId: stored.id,
    conversationId: conversation.id,
    contactPhone: msg.from,
    contactName,
    body,
    type,
    createdAt: messageAt,
    mediaId: media?.id ?? null,
    mediaMimeType: media?.mimeType ?? null,
    mediaFilename: media?.filename ?? null,
  });

  // 6. Auto-reply engine — keyword/welcome/away rules. Never throws.
  const isFirstInbound =
    !!conversation.firstInboundAt &&
    Math.abs(conversation.firstInboundAt.getTime() - messageAt.getTime()) < 2000;
  await runAutoReply({
    contactPhone: msg.from,
    body,
    messageId: stored.id,
    conversationId: conversation.id,
    contactName,
    isFirstInbound,
    isMuted: conversation.isMuted,
  });
}

async function handleStatus(st: WebhookStatus) {
  const ts = new Date(Number(st.timestamp) * 1000);
  const errors = st.errors ?? [];
  const first = errors[0];

  // Find the row so we can emit a realtime status update with its id/phone.
  const row = await prisma.whatsAppMessage.findUnique({
    where: { wamid: st.id },
    select: { id: true, contactPhone: true, conversationId: true },
  });

  await prisma.whatsAppMessage.updateMany({
    where: { wamid: st.id },
    data: {
      status: st.status,
      pricingCategory: st.pricing?.category ?? undefined,
      sentAt: st.status === "sent" ? ts : undefined,
      deliveredAt: st.status === "delivered" ? ts : undefined,
      readAt: st.status === "read" ? ts : undefined,
      errorCode: first ? String(first.code) : undefined,
      errorMessage: first ? (first.message ?? first.title) : undefined,
    },
  });

  if (row) {
    await notifyMessageStatus({
      messageId: row.id,
      conversationId: row.conversationId,
      contactPhone: row.contactPhone,
      status: st.status,
      errorCode: first ? String(first.code) : null,
      errorMessage: first ? (first.message ?? first.title) : null,
    });
  }
}

interface MediaMeta {
  id: string;
  mimeType: string | null;
  filename: string | null;
  sha256: string | null;
}

function extractInboundContent(msg: WebhookInboundMessage): {
  type: string;
  body: string | null;
  template: string | null;
  media: MediaMeta | null;
} {
  switch (msg.type) {
    case "text":
      return {
        type: "text",
        body: msg.text?.body ?? null,
        template: null,
        media: null,
      };
    case "image":
      return {
        type: "image",
        body: msg.image?.caption ?? null,
        template: null,
        media: msg.image?.id
          ? {
              id: msg.image.id,
              mimeType: msg.image.mime_type ?? null,
              filename: null,
              sha256: msg.image.sha256 ?? null,
            }
          : null,
      };
    case "document":
      return {
        type: "document",
        body: msg.document?.caption ?? msg.document?.filename ?? null,
        template: null,
        media: msg.document?.id
          ? {
              id: msg.document.id,
              mimeType: msg.document.mime_type ?? null,
              filename: msg.document.filename ?? null,
              sha256: msg.document.sha256 ?? null,
            }
          : null,
      };
    case "audio":
      return {
        type: "audio",
        body: null,
        template: null,
        media: msg.audio?.id
          ? {
              id: msg.audio.id,
              mimeType: msg.audio.mime_type ?? null,
              filename: null,
              sha256: msg.audio.sha256 ?? null,
            }
          : null,
      };
    case "video":
      return {
        type: "video",
        body: msg.video?.caption ?? null,
        template: null,
        media: msg.video?.id
          ? {
              id: msg.video.id,
              mimeType: msg.video.mime_type ?? null,
              filename: null,
              sha256: msg.video.sha256 ?? null,
            }
          : null,
      };
    case "sticker":
      return {
        type: "sticker",
        body: null,
        template: null,
        media: msg.sticker?.id
          ? {
              id: msg.sticker.id,
              mimeType: msg.sticker.mime_type ?? null,
              filename: null,
              sha256: msg.sticker.sha256 ?? null,
            }
          : null,
      };
    case "location": {
      const loc = msg.location;
      const where = loc ? `${loc.latitude},${loc.longitude}` : null;
      return {
        type: "location",
        body: loc?.name || loc?.address || where,
        template: null,
        media: null,
      };
    }
    case "reaction":
      return {
        type: "reaction",
        body: msg.reaction?.emoji ?? null,
        template: null,
        media: null,
      };
    case "button":
      return {
        type: "button",
        body: msg.button?.text ?? msg.button?.payload ?? null,
        template: null,
        media: null,
      };
    case "interactive":
      return { type: "interactive", body: null, template: null, media: null };
    default:
      return { type: msg.type || "unknown", body: null, template: null, media: null };
  }
}
