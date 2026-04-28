import "server-only";
import { prisma } from "@/lib/prisma";
import { sendBotText } from "./sender";
import { advanceBotConversation, normalizePhone } from "./identity";

/**
 * Bot-side compliance helpers.
 *
 *   • Opt-out detection — keywords that immediately stop the bot for this
 *     contact, mark `WhatsAppContact.optedIn = false`, and acknowledge to
 *     the guest. Required by Meta's commerce + business-policy guidelines
 *     for any automated messaging system.
 *
 *   • Quality-tier deference — if Meta drops the phone number's quality
 *     rating to "RED" (rare, but it happens after spam complaints), the
 *     bot pauses sends until an operator clears the alarm. The actual
 *     polling lives in the existing PhoneNumberHealth panel; this module
 *     only exposes the read helper that the engine consults each turn.
 */

const OPT_OUT_KEYWORDS = [
  "إلغاء",
  "الغاء",
  "إيقاف",
  "ايقاف",
  "توقف",
  "stop",
  "unsubscribe",
  "opt out",
  "remove me",
];

/**
 * Returns true when the inbound text is unambiguously an opt-out request.
 * We're conservative on purpose — false positives would be very damaging.
 * A 1-3 word message containing one of the keywords counts as opt-out;
 * longer messages where the keyword appears in passing do NOT.
 */
export function isOptOutRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.split(/\s+/).length > 4) return false;
  for (const kw of OPT_OUT_KEYWORDS) {
    if (trimmed.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/**
 * Apply opt-out: mark the contact as opted-out + blocked, set the bot
 * conversation to "opted_out", and send a single farewell message. After
 * this call, `gateway.decideGatewayAction` will return "skip" for every
 * future inbound from this number.
 */
export async function applyOptOut(args: {
  phone: string;
  reason?: string;
}): Promise<void> {
  const phone = normalizePhone(args.phone);
  if (!phone) return;

  await prisma.whatsAppContact
    .update({
      where: { phone },
      data: {
        optedIn: false,
        // Don't block — we still want to log inbound messages for audit, but
        // the gateway's `botMode != "off"` + state="opted_out" stops sends.
      },
    })
    .catch(() => undefined);

  await prisma.botConversation
    .updateMany({
      where: { contactPhone: phone },
      data: {
        state: "opted_out",
        escalatedAt: new Date(),
        escalationReason: args.reason ?? "opt_out",
      },
    })
    .catch(() => undefined);

  // Let the guest know we heard them — Meta requires an explicit ack.
  await sendBotText(
    phone,
    "تمّ إيقاف الرسائل التلقائية كما طلبت ✅\nيمكنك دائماً إرسال *مرحبا* لاستئناف المحادثة، أو التواصل مباشرة مع زميلتي ريم في أي وقت.",
    { origin: "bot:opt-out" },
  );
}

/**
 * Convenience wrapper for the engine — checks + applies + returns whether
 * the engine should stop the current turn.
 */
export async function maybeApplyOptOut(args: {
  phone: string;
  body: string | null;
  botConvId?: number;
}): Promise<boolean> {
  if (!isOptOutRequest(args.body)) return false;
  await applyOptOut({ phone: args.phone });
  if (args.botConvId) {
    await advanceBotConversation({
      botConvId: args.botConvId,
      state: "opted_out",
    });
  }
  return true;
}
