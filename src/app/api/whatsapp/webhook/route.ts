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
  const { type, body, template } = extractInboundContent(msg);

  // Try to link to a reservation by phone number (best-effort).
  const reservationId = await findReservationIdByPhone(msg.from);

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
      reservationId,
      sentAt: new Date(Number(msg.timestamp) * 1000),
    },
    update: {
      // Idempotency — Meta may redeliver the same message id.
      contactName: contactName ?? undefined,
    },
  });
}

async function handleStatus(st: WebhookStatus) {
  const ts = new Date(Number(st.timestamp) * 1000);
  const errors = st.errors ?? [];
  const first = errors[0];

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
}

function extractInboundContent(msg: WebhookInboundMessage): {
  type: string;
  body: string | null;
  template: string | null;
} {
  switch (msg.type) {
    case "text":
      return { type: "text", body: msg.text?.body ?? null, template: null };
    case "image":
      return { type: "image", body: msg.image?.caption ?? null, template: null };
    case "document":
      return {
        type: "document",
        body: msg.document?.caption ?? msg.document?.filename ?? null,
        template: null,
      };
    case "audio":
      return { type: "audio", body: null, template: null };
    case "video":
      return { type: "video", body: msg.video?.caption ?? null, template: null };
    case "sticker":
      return { type: "sticker", body: null, template: null };
    case "location": {
      const loc = msg.location;
      const where = loc ? `${loc.latitude},${loc.longitude}` : null;
      return {
        type: "location",
        body: loc?.name || loc?.address || where,
        template: null,
      };
    }
    case "reaction":
      return { type: "reaction", body: msg.reaction?.emoji ?? null, template: null };
    case "button":
      return {
        type: "button",
        body: msg.button?.text ?? msg.button?.payload ?? null,
        template: null,
      };
    case "interactive":
      return { type: "interactive", body: null, template: null };
    default:
      return { type: msg.type || "unknown", body: null, template: null };
  }
}

async function findReservationIdByPhone(phone: string): Promise<number | null> {
  if (!phone) return null;
  // Match against stored phones with a suffix heuristic: user may have
  // stored the number as "0781099910" while Meta reports "962781099910".
  const tail = phone.slice(-9);
  const row = await prisma.reservation.findFirst({
    where: { phone: { contains: tail } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}
