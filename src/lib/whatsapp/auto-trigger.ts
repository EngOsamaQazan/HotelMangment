import "server-only";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "./booking-confirmation";
import { upsertContact, upsertConversationForOutbound } from "./conversations";

/**
 * Default warm welcome caption used when the operator hasn't customised
 * `WhatsAppConfig.bookingConfirmationCaption`. Variables follow the same
 * `{{N}}` numbering as the booking-confirmation template body, so operators
 * can rebrand without touching code.
 *
 * Tone is intentionally hospitable and lightly informal — replaces the older
 * formal copy. Uses single-asterisk for WhatsApp bold (the platform does
 * NOT understand markdown double-asterisks).
 */
const DEFAULT_WELCOME_CAPTION = `هلا وغلا 🌙
نورت فندق المفرق يا *{{1}}*، حياك الله بين أهلك ❤️

تم تأكيد حجزك:
📅 الوصول: {{2}}
📅 المغادرة: {{3}}
🏷️ رقم الحجز: {{4}}

أرفقنا لك *عقد الإقامة* للاطلاع 📎

كل الليالي مباركة… والليلة أبرك بوجودك 🙏
بانتظارك، وأي شي تحتاجه احنا بالخدمة 24 ساعة 🤝`;

/**
 * Default Quranic / Sunnah follow-up message — sent right after the
 * confirmation as a free-text message inside the now-open 24-hour
 * customer-service window. Mirrors the religious section already
 * printed on the contract PDF, formatted as a tasteful blessing.
 *
 * WhatsApp renders Arabic Quranic glyphs (﴿ ﴾) as is — no extra
 * font work required.
 */
const DEFAULT_FOLLOW_UP_TEXT = `\u{1F319} ذكرى مباركة بين يدي إقامتك:

﴿ وَقُل رَّبِّ أَنزِلْنِي مُنزَلًا مُّبَارَكًا وَأَنتَ خَيْرُ الْمُنزِلِينَ ﴾
— سورة المؤمنون، الآية 29

قال رسول الله ﷺ:
«اللَّهُمَّ بَارِكْ لَنَا فِي شَامِنَا، وَبَارِكْ لَنَا فِي يَمَنِنَا»
— رواه البخاري

نسأل الله أن يجعلها إقامة طيبة مباركة عليك وعلى أهلك،
وأن يحفظكم في حلكم وترحالكم 🤲

— من قلب فندق المفرق ❤️`;

/**
 * Origin tag stamped on the synchronous "queued" placeholder row created
 * before the actual send fires. The recovery scanner uses this to detect
 * crash-victim attempts (queued for too long, no follow-up rows) and
 * re-trigger the send.
 */
const QUEUE_ORIGIN = "booking-confirmation:auto-queued";

/** How long a `queued` placeholder may live before the recovery scanner
 *  considers it abandoned (typical real send takes 2–10 s). */
const QUEUE_STALE_MS = 60_000;

/** How far back the recovery scanner looks for unsent reservations. */
const RECOVERY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Fire-and-forget WhatsApp dispatch triggered after a successful
 * reservation create.
 *
 * Crash-safety: BEFORE returning to the caller we synchronously create a
 * `queued` placeholder row in the inbox so the operator (and the recovery
 * scanner) can always see that an attempt was scheduled — even if the dev
 * server hot-reloads or the process exits before the `setImmediate`
 * callback fires.
 */
export function triggerBookingConfirmationAsync(reservationId: number): void {
  // 1) Optimistic placeholder — never blocks the caller for long because
  //    these are 2 trivial Prisma roundtrips.
  void enqueuePlaceholder(reservationId);

  // 2) Actual dispatch on the next tick.
  setImmediate(() => {
    runBookingConfirmation(reservationId).catch((err) => {
      console.error(
        `[booking-auto-confirm] reservation #${reservationId} failed:`,
        err,
      );
    });
  });
}

/**
 * Synchronous-ish placeholder row creator. We don't `await` from the
 * trigger entry point so the response stays fast, but we do persist
 * before any async work begins so the row survives a hot-reload.
 */
async function enqueuePlaceholder(reservationId: number): Promise<void> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { phone: true },
    });
    const rawPhone = reservation?.phone ?? "";
    const phoneDigits = rawPhone.replace(/[^0-9]/g, "");
    if (phoneDigits.length < 8) return; // can't open a conversation, skip

    // Skip if a placeholder/template/document row already exists — avoids
    // duplicate ghost rows on retries.
    const existing = await prisma.whatsAppMessage.findFirst({
      where: {
        reservationId,
        direction: "outbound",
        OR: [
          { type: "template" },
          { type: "document" },
          { templateName: QUEUE_ORIGIN },
        ],
      },
      select: { id: true },
    });
    if (existing) return;

    const contact = await upsertContact({
      phone: phoneDigits,
      source: "whatsapp",
      optedIn: true,
      updatedByUserId: null,
    });
    const conversation = await upsertConversationForOutbound(
      phoneDigits,
      new Date(),
      contact.id,
      null,
    );
    await prisma.whatsAppMessage.create({
      data: {
        direction: "outbound",
        contactPhone: phoneDigits,
        type: "template",
        body: null,
        templateName: QUEUE_ORIGIN,
        status: "queued",
        reservationId,
        conversationId: conversation.id,
        isInternalNote: false,
      },
    });
  } catch (err) {
    console.warn(
      `[booking-auto-confirm] could not enqueue placeholder for #${reservationId}:`,
      err,
    );
  }
}

/** Drop the placeholder once a real template row has been logged. */
async function clearPlaceholder(reservationId: number): Promise<void> {
  try {
    await prisma.whatsAppMessage.deleteMany({
      where: {
        reservationId,
        templateName: QUEUE_ORIGIN,
        status: "queued",
      },
    });
  } catch {
    /* swallow — non-critical */
  }
}

async function runBookingConfirmation(reservationId: number): Promise<void> {
  const tag = `[booking-auto-confirm #${reservationId}]`;
  const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
  if (!cfg) {
    console.log(`${tag} skipping: no WhatsAppConfig row exists`);
    await clearPlaceholder(reservationId);
    return;
  }
  if (!cfg.isActive) {
    console.log(`${tag} skipping: WhatsApp integration is inactive`);
    await clearPlaceholder(reservationId);
    return;
  }
  if (!cfg.autoSendBookingConfirmation) {
    console.log(
      `${tag} skipping: auto-send disabled. فعّلها من /settings/whatsapp ▸ بطاقة "تأكيد الحجز التلقائي".`,
    );
    await clearPlaceholder(reservationId);
    return;
  }
  if (!cfg.phoneNumberId || !cfg.accessTokenEnc) {
    console.warn(`${tag} skipping: WhatsApp not fully configured`);
    await clearPlaceholder(reservationId);
    return;
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { phone: true, guestName: true },
  });
  if (!reservation?.phone) {
    console.warn(`${tag} skipping: no phone on reservation`);
    await clearPlaceholder(reservationId);
    return;
  }

  console.log(
    `${tag} dispatching to ${reservation.phone} (${reservation.guestName})...`,
  );
  const startedAt = Date.now();
  let result;
  try {
    result = await sendBookingConfirmation({
      reservationId,
      templateName: cfg.bookingConfirmationTemplate,
      templateLanguage: cfg.bookingConfirmationLanguage,
      welcomeCaption: cfg.bookingConfirmationCaption ?? DEFAULT_WELCOME_CAPTION,
      followUpText: cfg.bookingFollowUpEnabled
        ? (cfg.bookingFollowUpText ?? DEFAULT_FOLLOW_UP_TEXT)
        : null,
    });
  } finally {
    // The placeholder served its purpose (proof of attempt). Whether
    // success or failure, the real `template` row inside
    // sendBookingConfirmation has been written via beginOutboundLog,
    // so we drop the placeholder to avoid double-counting.
    await clearPlaceholder(reservationId);
  }
  const elapsed = Date.now() - startedAt;

  if (result.warnings.length > 0) {
    console.warn(
      `${tag} delivered with warnings (${elapsed}ms):`,
      result.warnings,
    );
  } else {
    console.log(
      `${tag} ✅ delivered in ${elapsed}ms (template=${result.templateMessageId ?? "—"}, doc=${result.documentMessageId ?? "—"}, follow=${result.followUpMessageId ?? "—"})`,
    );
  }
}

/**
 * Boot-time / on-demand recovery scanner.
 *
 * Walks every reservation created in the last `RECOVERY_WINDOW_MS` and
 * re-fires the trigger when no `template` outbound message has ever
 * been logged AND no fresh `queued` placeholder exists. This recovers
 * confirmations that were lost to dev-server hot-reloads, transient
 * Meta errors, or process restarts.
 *
 * Safe to call multiple times — `enqueuePlaceholder` deduplicates and
 * `triggerBookingConfirmationAsync` itself is idempotent at the inbox
 * layer (we early-return when a real template/document row already
 * exists for the reservation).
 */
export async function recoverPendingBookingConfirmations(): Promise<{
  scanned: number;
  refired: number;
}> {
  try {
    const since = new Date(Date.now() - RECOVERY_WINDOW_MS);
    const recent = await prisma.reservation.findMany({
      where: {
        createdAt: { gt: since },
        phone: { not: null },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (recent.length === 0) {
      return { scanned: 0, refired: 0 };
    }

    const cfg = await prisma.whatsAppConfig.findUnique({ where: { id: 1 } });
    if (!cfg?.isActive || !cfg.autoSendBookingConfirmation) {
      return { scanned: recent.length, refired: 0 };
    }

    let refired = 0;
    for (const r of recent) {
      // Skip if a real outbound template/document row already exists.
      const realRow = await prisma.whatsAppMessage.findFirst({
        where: {
          reservationId: r.id,
          direction: "outbound",
          OR: [
            { type: "template", templateName: { not: QUEUE_ORIGIN } },
            { type: "document" },
          ],
        },
        select: { id: true },
      });
      if (realRow) continue;

      // If a queued placeholder is FRESH (< QUEUE_STALE_MS), assume
      // another worker is mid-flight and don't pile on.
      const queuedRow = await prisma.whatsAppMessage.findFirst({
        where: {
          reservationId: r.id,
          templateName: QUEUE_ORIGIN,
          status: "queued",
        },
        select: { id: true, createdAt: true },
      });
      if (queuedRow && Date.now() - queuedRow.createdAt.getTime() < QUEUE_STALE_MS) {
        continue;
      }

      console.log(
        `[booking-recovery] re-firing trigger for reservation #${r.id} (created ${r.createdAt.toISOString()})`,
      );
      // Drop the stale placeholder so enqueuePlaceholder writes a fresh one.
      if (queuedRow) {
        await prisma.whatsAppMessage
          .delete({ where: { id: queuedRow.id } })
          .catch(() => {});
      }
      triggerBookingConfirmationAsync(r.id);
      refired += 1;
    }

    return { scanned: recent.length, refired };
  } catch (err) {
    console.error("[booking-recovery] scan failed:", err);
    return { scanned: 0, refired: 0 };
  }
}

export { DEFAULT_WELCOME_CAPTION, DEFAULT_FOLLOW_UP_TEXT };
