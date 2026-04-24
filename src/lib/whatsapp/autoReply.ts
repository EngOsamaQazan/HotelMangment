import "server-only";
import { Prisma, type WhatsAppAutoReplyRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendText, sendTemplate, isWhatsAppApiError } from "./client";
import { notifyConversationUpdated, notifyMessageStatus } from "./fanout";

/**
 * Keyword-based auto-reply engine. Called from the webhook for inbound text
 * messages. Evaluates rules in `priority ASC, id ASC` order, fires the first
 * match, and respects:
 *
 *   • Conversation mute flag (skip everything)
 *   • Per-contact cooldown window (default 60 min)
 *   • "away" mode: only within quietHoursStart/End (Asia/Amman)
 *   • "welcome" mode: only on the first inbound ever for that contact
 *
 * Outbound auto-reply uses `sendText` by default, but if the rule has a
 * `templateName` we use that so it works even outside the 24h window.
 */

export interface AutoReplyInput {
  /** E.164 digits. */
  contactPhone: string;
  /** The inbound text body (null for non-text). */
  body: string | null;
  /** Inbound WhatsAppMessage id (for cooldown bookkeeping). */
  messageId: number;
  /** Conversation id we just upserted. */
  conversationId: number;
  /** WhatsApp profile name for personalisation. */
  contactName: string | null;
  /** When true this is the contact's first-ever inbound message. */
  isFirstInbound: boolean;
  /** When true the conversation is muted and we skip all rules. */
  isMuted: boolean;
}

interface RuleMatchContext {
  body: string | null;
  bodyLower: string;
  isFirstInbound: boolean;
  now: Date;
}

/** Entry point. Never throws — auto-reply failures must not break the webhook. */
export async function runAutoReply(input: AutoReplyInput): Promise<void> {
  try {
    if (input.isMuted) return;

    const rules = await prisma.whatsAppAutoReplyRule.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
    });
    if (rules.length === 0) return;

    const now = new Date();
    const ctx: RuleMatchContext = {
      body: input.body,
      bodyLower: (input.body ?? "").trim().toLowerCase(),
      isFirstInbound: input.isFirstInbound,
      now,
    };

    for (const rule of rules) {
      if (!matchesRule(rule, ctx)) continue;

      // Cooldown — check the most recent outbound auto-reply for this phone.
      if (rule.cooldownMinutes > 0) {
        const cooldownSince = new Date(
          now.getTime() - rule.cooldownMinutes * 60_000,
        );
        const recent = await prisma.whatsAppMessage.findFirst({
          where: {
            contactPhone: input.contactPhone,
            direction: "outbound",
            createdAt: { gte: cooldownSince },
            OR: [
              { templateName: rule.templateName ?? undefined },
              { type: "text", sentByUserId: null },
            ],
          },
          select: { id: true },
        });
        if (recent) {
          continue; // Too soon — skip this rule, try the next one
        }
      }

      await fireRule(rule, input);
      return; // First match wins
    }
  } catch (err) {
    console.error("[whatsapp/autoReply] engine error:", err);
  }
}

function matchesRule(rule: WhatsAppAutoReplyRule, ctx: RuleMatchContext): boolean {
  // Quiet-hours gate — "away" mode *requires* the inbound to land inside the
  // window; other modes treat the window as a suppression zone (don't fire
  // during business hours outside the rule's design).
  const insideQuiet = isInsideQuietHours(rule, ctx.now);
  if (rule.matchMode === "away") {
    if (!insideQuiet) return false;
  }

  switch (rule.matchMode) {
    case "welcome":
      return ctx.isFirstInbound;

    case "away":
      return ctx.body !== null; // fire on any inbound while away

    case "keyword": {
      if (!ctx.bodyLower) return false;
      const triggers = parseTriggers(rule.triggers);
      return triggers.some((t) => ctx.bodyLower.includes(t));
    }

    case "exact": {
      if (!ctx.bodyLower) return false;
      const triggers = parseTriggers(rule.triggers);
      return triggers.some((t) => ctx.bodyLower === t);
    }

    case "regex": {
      if (!ctx.body) return false;
      try {
        const re = new RegExp(rule.triggers, "i");
        return re.test(ctx.body);
      } catch {
        return false;
      }
    }

    default:
      return false;
  }
}

function parseTriggers(raw: string): string[] {
  return raw
    .split(/[|\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Asia/Amman quiet-hours check. `quietHoursStart` / `quietHoursEnd` are
 * stored as "HH:mm" strings. If start > end the window wraps midnight
 * (e.g. 22:00 → 07:00).
 */
function isInsideQuietHours(rule: WhatsAppAutoReplyRule, now: Date): boolean {
  if (!rule.quietHoursStart || !rule.quietHoursEnd) return true; // always on
  const amman = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Amman" }));
  const cur = amman.getHours() * 60 + amman.getMinutes();
  const start = parseHm(rule.quietHoursStart);
  const end = parseHm(rule.quietHoursEnd);
  if (start === null || end === null) return true;
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  // wraps midnight
  return cur >= start || cur < end;
}

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

async function fireRule(
  rule: WhatsAppAutoReplyRule,
  input: AutoReplyInput,
): Promise<void> {
  const text = interpolate(rule.replyText, input);
  // The webhook has already upserted the conversation for us — reuse it so
  // we don't race with concurrent upserts.
  const conversationId = input.conversationId;

  const row = await prisma.whatsAppMessage.create({
    data: {
      direction: "outbound",
      contactPhone: input.contactPhone,
      type: rule.templateName ? "template" : "text",
      body: text,
      templateName: rule.templateName,
      status: "queued",
      sentByUserId: null,
      conversationId,
    },
  });

  try {
    const resp = rule.templateName
      ? await sendTemplate({
          to: input.contactPhone,
          templateName: rule.templateName,
          language: "ar",
        })
      : await sendText({ to: input.contactPhone, text });
    const wamid = resp.messages?.[0]?.id ?? null;
    await prisma.whatsAppMessage.update({
      where: { id: row.id },
      data: {
        wamid,
        status: "sent",
        sentAt: new Date(),
        rawJson: resp as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.whatsAppAutoReplyRule.update({
      where: { id: rule.id },
      data: {
        timesFired: { increment: 1 },
        lastFiredAt: new Date(),
      },
    });
    if (rule.addTag) {
      await tagContact(input.contactPhone, rule.addTag).catch(() => {});
    }
    await notifyMessageStatus({
      messageId: row.id,
      conversationId,
      contactPhone: input.contactPhone,
      status: "sent",
    });
    await notifyConversationUpdated({
      conversationId,
      contactPhone: input.contactPhone,
      reason: "new_outbound",
      actorUserId: null,
    });
  } catch (err) {
    const apiErr = isWhatsAppApiError(err) ? err : null;
    await prisma.whatsAppMessage.update({
      where: { id: row.id },
      data: {
        status: "failed",
        errorCode: apiErr?.code ? String(apiErr.code) : null,
        errorMessage: apiErr?.message ?? (err as Error).message,
      },
    });
  }
}

function interpolate(tpl: string, input: AutoReplyInput): string {
  const firstName = (input.contactName ?? "").trim().split(/\s+/)[0] ?? "";
  return tpl
    .replace(/\{\{\s*contactName\s*\}\}/g, input.contactName ?? "")
    .replace(/\{\{\s*firstName\s*\}\}/g, firstName)
    .replace(/\{\{\s*hotelName\s*\}\}/g, "فندق المفرق")
    .replace(/\{\{\s*phone\s*\}\}/g, input.contactPhone);
}

async function tagContact(phone: string, tag: string): Promise<void> {
  const contact = await prisma.whatsAppContact.findUnique({
    where: { phone },
    select: { id: true, tags: true },
  });
  if (!contact) return;
  if (contact.tags.includes(tag)) return;
  await prisma.whatsAppContact.update({
    where: { id: contact.id },
    data: { tags: { set: [...contact.tags, tag] } },
  });
}
