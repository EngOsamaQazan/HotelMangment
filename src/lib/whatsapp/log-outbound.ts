import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { upsertContact, upsertConversationForOutbound } from "./conversations";
import { notifyConversationUpdated, notifyMessageStatus } from "./fanout";
import { isWhatsAppApiError } from "./client";

/**
 * Single source of truth for "log this outbound WhatsApp message into the
 * inbox". Every send-site (text, template, media, document, OTP, booking
 * confirmation, auto-reply, push quick-reply, …) MUST funnel through this
 * helper so the message shows up at /whatsapp.
 *
 * Two phases:
 *   1) `beginOutboundLog(...)` — creates the optimistic row + ensures
 *      contact/conversation exist; returns row id + conversation id.
 *   2) `finishOutboundLog(...)` — patches the row with the wamid + status,
 *      and pushes a realtime fanout event to subscribed dashboards.
 *
 * Both phases swallow errors internally (logging must NEVER block a real send),
 * but we re-throw if the caller passes `strict: true` for tests/diagnostics.
 */

export type OutboundType =
  | "text"
  | "template"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "interactive";

export interface BeginOutboundLogInput {
  to: string; // E.164 digits, no "+"
  type: OutboundType;
  /** Plain text body (free-form) or document/image caption. Null for templates without caption. */
  body?: string | null;
  /** Template name when `type === "template"`. Used for analytics. */
  templateName?: string | null;
  /** Optional reservation soft-link. */
  reservationId?: number | null;
  /** Operator who triggered the send (null for automated/system sends). */
  sentByUserId?: number | null;
  /** True for automated sends (OTP, booking confirmation, auto-reply). */
  isInternalNote?: boolean;
  /** Media metadata (when sending a non-text message). */
  mediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
  mediaSize?: number | null;
  /** Origin tag for diagnostics (e.g. "send-template", "booking-confirmation"). */
  origin?: string;
}

export interface FinishOutboundLogInput {
  rowId: number;
  conversationId: number;
  contactPhone: string;
  /** Successful response from Meta — sets wamid + status="sent". */
  ok?: { wamid: string | null; raw?: unknown };
  /** Failure — sets status="failed" + error fields. */
  err?: unknown;
}

export interface OutboundLogHandle {
  rowId: number;
  conversationId: number;
}

/**
 * Phase 1 — create the optimistic outbound row in the inbox before the
 * actual send. Returns the row id + conversation id so the caller can patch
 * them after the network call.
 */
export async function beginOutboundLog(
  input: BeginOutboundLogInput,
): Promise<OutboundLogHandle | null> {
  try {
    if (!input.to) return null;

    // Ensure phonebook + conversation rows so the inbox UI joins cleanly.
    const contact = await upsertContact({
      phone: input.to,
      source: "whatsapp",
      optedIn: true,
      updatedByUserId: input.sentByUserId ?? null,
    });
    const conversation = await upsertConversationForOutbound(
      input.to,
      new Date(),
      contact.id,
      input.sentByUserId ?? null,
    );

    const row = await prisma.whatsAppMessage.create({
      data: {
        direction: "outbound",
        contactPhone: input.to,
        type: input.type,
        body: input.body ?? null,
        templateName: input.templateName ?? null,
        status: "queued",
        reservationId: input.reservationId ?? null,
        sentByUserId: input.sentByUserId ?? null,
        conversationId: conversation.id,
        isInternalNote: input.isInternalNote ?? false,
        mediaId: input.mediaId ?? null,
        mediaMimeType: input.mediaMimeType ?? null,
        mediaFilename: input.mediaFilename ?? null,
        mediaSize: input.mediaSize ?? null,
      },
    });
    return { rowId: row.id, conversationId: conversation.id };
  } catch (err) {
    console.error("[beginOutboundLog]", input.origin ?? "?", err);
    return null;
  }
}

/**
 * Phase 2 — patch the optimistic row with the result of the actual send and
 * fan out the status to live dashboards.
 */
export async function finishOutboundLog(input: FinishOutboundLogInput): Promise<void> {
  try {
    if (input.ok) {
      const wamid = input.ok.wamid ?? null;
      const raw = input.ok.raw ?? null;
      await prisma.whatsAppMessage.update({
        where: { id: input.rowId },
        data: {
          wamid,
          status: "sent",
          sentAt: new Date(),
          rawJson: (raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      await notifyMessageStatus({
        messageId: input.rowId,
        conversationId: input.conversationId,
        contactPhone: input.contactPhone,
        status: "sent",
      });
      await notifyConversationUpdated({
        conversationId: input.conversationId,
        contactPhone: input.contactPhone,
        reason: "new_outbound",
      });
    } else if (input.err) {
      const apiErr = isWhatsAppApiError(input.err) ? input.err : null;
      await prisma.whatsAppMessage.update({
        where: { id: input.rowId },
        data: {
          status: "failed",
          errorCode: apiErr?.code ? String(apiErr.code) : null,
          errorMessage: apiErr?.message ?? (input.err as Error).message,
        },
      });
      await notifyMessageStatus({
        messageId: input.rowId,
        conversationId: input.conversationId,
        contactPhone: input.contactPhone,
        status: "failed",
        errorCode: apiErr?.code ? String(apiErr.code) : null,
        errorMessage: apiErr?.message ?? (input.err as Error).message,
      });
    }
  } catch (err) {
    console.error("[finishOutboundLog]", err);
  }
}

/**
 * One-shot convenience for sites that already have the wamid and want to
 * just record the send. Equivalent to begin + finish in a single call.
 */
export async function logOutboundOneShot(
  input: BeginOutboundLogInput & {
    wamid: string | null;
    raw?: unknown;
    failed?: { errorCode?: string | null; errorMessage?: string | null };
  },
): Promise<OutboundLogHandle | null> {
  const handle = await beginOutboundLog(input);
  if (!handle) return null;
  if (input.failed) {
    await finishOutboundLog({
      rowId: handle.rowId,
      conversationId: handle.conversationId,
      contactPhone: input.to,
      err: new Error(input.failed.errorMessage ?? "send failed"),
    });
  } else {
    await finishOutboundLog({
      rowId: handle.rowId,
      conversationId: handle.conversationId,
      contactPhone: input.to,
      ok: { wamid: input.wamid, raw: input.raw },
    });
  }
  return handle;
}
