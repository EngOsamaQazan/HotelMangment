import "server-only";
import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "./tools";
import { advanceBotConversation, readSlots } from "./identity";
import {
  sendBotText,
  sendBotButtons,
  sendBotList,
} from "./sender";
import { HOLD_TTL_MINUTES } from "@/lib/booking/hold";

/**
 * Deterministic, rule-based dialog driver. Activates whenever the LLM is
 * disabled, missing an API key, over budget, or has tripped a circuit
 * breaker. Drives the same booking journey as the AI agent — search,
 * quote, hold, payment — but with fixed Interactive Lists and Buttons
 * instead of free-form Arabic.
 *
 * State machine (mirrors `BotConversation.state`):
 *
 *   idle ─ any inbound ──────► greeting (sends menu)
 *   greeting:
 *     "bot:menu:book"      ──► collecting (asks for check-in date)
 *     "bot:menu:lookup"    ──► runs lookupReservation
 *     "bot:menu:human"     ──► escalates
 *   collecting:
 *     waits for "DD-MM-YYYY .. DD-MM-YYYY .. N" — also accepts a quick-pick
 *     button shortcut for "tonight + 1 night + 2 guests" etc.
 *   quoting:
 *     "bot:opt:<unit|merge>:<id>"  ──► holds + creates payment link.
 *
 * Free-text outside of `collecting` automatically escalates so we never
 * leave the guest staring at silence.
 */

// ──────────────────────── inbound id namespace ─────────────────────────

const ID_MENU_BOOK = "bot:menu:book";
const ID_MENU_LOOKUP = "bot:menu:lookup";
const ID_MENU_HUMAN = "bot:menu:human";
const ID_OPT_PREFIX = "bot:opt:"; // bot:opt:unit:42  |  bot:opt:merge:7
const ID_QUICKPICK_PREFIX = "bot:qp:"; // bot:qp:tonight, bot:qp:tomorrow, etc.
const ID_CONFIRM_HOLD = "bot:confirm:hold";
const ID_CANCEL_HOLD = "bot:cancel:hold";

// ───────────────────────────── parsing ────────────────────────────────

/** Accepts "12-05-2026", "12/5/26", "2026-05-12", or "12 5 2026". */
function parseLooseDate(input: string, now: Date): Date | null {
  const trimmed = input.replace(/[^\d/\-\s]/g, " ").trim();
  // ISO YYYY-MM-DD shortcut
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // DMY
  const dmy = /^(\d{1,2})[-/\s](\d{1,2})[-/\s](\d{2,4})$/.exec(trimmed);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    const date = new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    if (Number.isNaN(date.getTime())) return null;
    // Reject obviously past dates by more than 30 days (typo guard).
    if (date.getTime() < now.getTime() - 30 * 86_400_000) return null;
    return date;
  }
  return null;
}

/** Pulls "[checkIn] [checkOut] [guests]" from one inbound text blob. */
function parseSlotsFromText(
  text: string,
  now: Date,
): { checkIn?: Date; checkOut?: Date; guests?: number } {
  const result: { checkIn?: Date; checkOut?: Date; guests?: number } = {};

  // Extract integers — last 1-2 digit number is taken as guest count when ≤ 20.
  const guestMatch = /(\d{1,2})\s*(?:ضيف|أشخاص|اشخاص|نفر|persons?|guests?)/i.exec(
    text,
  );
  if (guestMatch) {
    const g = Number(guestMatch[1]);
    if (g >= 1 && g <= 20) result.guests = g;
  }

  // Find dates: support "from X to Y" or simply two date tokens separated by
  // dash / "إلى" / "to".
  const rangeMatch = /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})\s*(?:إلى|to|-|–|—)\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})/.exec(
    text,
  );
  if (rangeMatch) {
    const a = parseLooseDate(rangeMatch[1], now);
    const b = parseLooseDate(rangeMatch[2], now);
    if (a) result.checkIn = a;
    if (b) result.checkOut = b;
  } else {
    // Single date → assume 1 night.
    const single = /(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-\d{2}-\d{2})/.exec(text);
    if (single) {
      const d = parseLooseDate(single[1], now);
      if (d) {
        result.checkIn = d;
        result.checkOut = new Date(d.getTime() + 86_400_000);
      }
    }
  }

  return result;
}

// ─────────────────────── side-effect helpers ───────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function sendMainMenu(phone: string): Promise<void> {
  await sendBotButtons({
    to: phone,
    headerText: "أهلاً بك",
    bodyText:
      "مرحباً 👋\nأنا المساعد الذكي للحجز. كيف يمكنني خدمتك؟",
    footerText: "اختر من الأزرار التالية",
    buttons: [
      { id: ID_MENU_BOOK, title: "حجز جديد" },
      { id: ID_MENU_LOOKUP, title: "استعلام عن حجزي" },
      { id: ID_MENU_HUMAN, title: "تحدث مع موظف" },
    ],
    origin: "bot:fallback",
  });
}

async function askForDates(phone: string): Promise<void> {
  await sendBotText(
    phone,
    "ممتاز! متى تريد الإقامة؟ \n\n" +
      "أرسل التواريخ بهذا الشكل:\n" +
      "*15-05-2026 إلى 17-05-2026 لشخصين*\n\n" +
      "أو اختصاراً: *15-05-2026 لـ 2 ليلة 2 ضيف*",
    { origin: "bot:fallback" },
  );
}

async function presentOptions(
  phone: string,
  options: Array<{
    kind: "unit" | "merge";
    id: number;
    nameAr: string;
    fromNightlyJod: number | null;
    capacity: number;
  }>,
): Promise<void> {
  if (options.length === 0) {
    await sendBotButtons({
      to: phone,
      bodyText:
        "آسف 🙏 لا توجد وحدات متاحة لهذه التواريخ. تريد تجربة تاريخ آخر؟",
      buttons: [
        { id: ID_MENU_BOOK, title: "تواريخ أخرى" },
        { id: ID_MENU_HUMAN, title: "تحدث مع موظف" },
      ],
      origin: "bot:fallback",
    });
    return;
  }
  // WhatsApp lists allow up to 10 rows total.
  const rows = options.slice(0, 10).map((o) => ({
    id: `${ID_OPT_PREFIX}${o.kind}:${o.id}`,
    title: o.nameAr.slice(0, 24),
    description: `${o.fromNightlyJod ?? "—"} د.أ/ليلة • تتسع ${o.capacity}`,
  }));
  await sendBotList({
    to: phone,
    headerText: "الخيارات المتاحة",
    bodyText: "اخترْ الوحدة التي تناسبك:",
    buttonText: "عرض الخيارات",
    sections: [{ title: "للحجز", rows }],
    origin: "bot:fallback",
  });
}

async function presentQuote(
  phone: string,
  optionId: string,
  optionName: string,
  total: number,
  nights: number,
): Promise<void> {
  await sendBotButtons({
    to: phone,
    headerText: optionName.slice(0, 60),
    bodyText:
      `تفاصيل الحجز:\n` +
      `• ${nights} ليلة\n` +
      `• المجموع: ${total} د.أ\n\n` +
      `هل ترغب بتأكيد الحجز ودفع المبلغ الآن؟`,
    footerText: `الحجز محجوز لمدة ${HOLD_TTL_MINUTES} دقيقة`,
    buttons: [
      { id: ID_CONFIRM_HOLD + ":" + optionId, title: "نعم، أكِّد" },
      { id: ID_CANCEL_HOLD, title: "لا، ألغِ" },
    ],
    origin: "bot:fallback",
  });
}

// ───────────────────────── main entry point ────────────────────────────

export interface FallbackInput {
  phone: string;
  /** Inbound text or "id|title" payload coming out of the webhook. */
  body: string | null;
  type: string;
  ctx: ToolContext;
}

/**
 * Drive one turn of the fallback dialog. Always returns — never throws.
 */
export async function runFallbackTurn(input: FallbackInput): Promise<void> {
  const { phone, body, ctx } = input;
  const conv = ctx.botConv;
  const slots = readSlots(conv);
  const now = ctx.now;

  // Parse interactive replies into a pure id when present.
  let interactiveId: string | null = null;
  let textBody: string | null = null;
  if (input.type === "interactive" && body) {
    const [id] = body.split("|");
    interactiveId = id ?? null;
  } else if (typeof body === "string") {
    textBody = body.trim();
  }

  // Universal exit hatch — tap "Talk to human" any time.
  if (interactiveId === ID_MENU_HUMAN) {
    await runTool("escalateToHuman", {
      reason: "user_requested",
      summaryAr: "الضيف طلب التحدث مع موظف بشري من قائمة البوت.",
    }, ctx);
    await sendBotText(
      phone,
      "حوّلت محادثتك إلى زميلتي 🙋‍♀️ ستتواصل معك خلال دقائق.",
      { origin: "bot:fallback" },
    );
    return;
  }

  // ─── greeting / idle ────────────────────────────────────────────────
  if (conv.state === "idle" || conv.state === "done") {
    await sendMainMenu(phone);
    await advanceBotConversation({
      botConvId: conv.id,
      state: "greeting",
      outboundAt: now,
    });
    return;
  }

  if (conv.state === "greeting") {
    if (interactiveId === ID_MENU_BOOK) {
      await askForDates(phone);
      await advanceBotConversation({
        botConvId: conv.id,
        state: "collecting",
        outboundAt: now,
      });
      return;
    }
    if (interactiveId === ID_MENU_LOOKUP) {
      const lookup = await runTool("lookupReservation", {}, ctx);
      if (lookup.ok && lookup.data.found && lookup.data.reservation) {
        const r = lookup.data.reservation;
        await sendBotText(
          phone,
          `حجزك ${r.confirmationCode ?? `#${r.id}`}:\n` +
            `• ${r.checkIn} → ${r.checkOut} (${r.nights} ليلة)\n` +
            `• الوحدة: ${r.unitNumber ?? "—"}\n` +
            `• المجموع: ${r.total} د.أ — المتبقي: ${r.remaining} د.أ`,
          { origin: "bot:fallback" },
        );
      } else {
        await sendBotText(
          phone,
          "لم أعثر على حجز سابق مرتبط برقمك. تريد إنشاء حجز جديد؟",
          { origin: "bot:fallback" },
        );
      }
      await advanceBotConversation({
        botConvId: conv.id,
        state: "idle",
        outboundAt: now,
      });
      return;
    }
    // Free-text in greeting → re-show menu briefly.
    await sendMainMenu(phone);
    return;
  }

  // ─── collecting ─────────────────────────────────────────────────────
  if (conv.state === "collecting") {
    if (!textBody) {
      await askForDates(phone);
      return;
    }
    const parsed = parseSlotsFromText(textBody, now);
    const checkIn = parsed.checkIn ?? (slots.checkIn ? new Date(slots.checkIn) : null);
    const checkOut = parsed.checkOut ?? (slots.checkOut ? new Date(slots.checkOut) : null);
    const guests = parsed.guests ?? slots.guests ?? null;

    // Persist whatever we did parse so the next turn can fill the rest.
    await advanceBotConversation({
      botConvId: conv.id,
      slotsPatch: {
        checkIn: checkIn ? ymd(checkIn) : slots.checkIn,
        checkOut: checkOut ? ymd(checkOut) : slots.checkOut,
        guests: guests ?? slots.guests,
      },
      inboundAt: now,
    });

    if (!checkIn || !checkOut || !guests) {
      await sendBotText(
        phone,
        "ما لقطت كل التفاصيل 🙏\nأرسل رجاءً: تاريخ الوصول + المغادرة + عدد الأشخاص.\n" +
          "مثال: *15-05-2026 إلى 17-05-2026 لشخصين*",
        { origin: "bot:fallback" },
      );
      return;
    }

    const result = await runTool(
      "searchAvailability",
      {
        checkIn: ymd(checkIn),
        checkOut: ymd(checkOut),
        guests,
      },
      ctx,
    );
    if (!result.ok) {
      await sendBotText(
        phone,
        `تعذّر البحث: ${result.error.message}`,
        { origin: "bot:fallback" },
      );
      return;
    }
    await presentOptions(phone, result.data.options);
    await advanceBotConversation({
      botConvId: conv.id,
      state: "quoting",
      slotsPatch: {
        lastShownOptions: result.data.options.map((o) => o.id),
      },
      outboundAt: now,
    });
    return;
  }

  // ─── quoting → user picks an option from the list ──────────────────
  if (conv.state === "quoting") {
    if (interactiveId?.startsWith(ID_OPT_PREFIX)) {
      const [, , kind, idStr] = interactiveId.split(":"); // bot:opt:unit:42
      const id = Number(idStr);
      const checkIn = slots.checkIn;
      const checkOut = slots.checkOut;
      const guests = slots.guests;
      if (
        !checkIn ||
        !checkOut ||
        !guests ||
        (kind !== "unit" && kind !== "merge")
      ) {
        await sendBotText(
          phone,
          "حصل التباس بسيط 🙏 لنبدأ من جديد. اضغط حجز جديد:",
          { origin: "bot:fallback" },
        );
        await advanceBotConversation({
          botConvId: conv.id,
          state: "idle",
        });
        return;
      }
      const quote = await runTool(
        "getQuote",
        { kind: kind as "unit" | "merge", id, checkIn, checkOut, guests },
        ctx,
      );
      if (!quote.ok) {
        await sendBotText(
          phone,
          quote.error.message,
          { origin: "bot:fallback" },
        );
        return;
      }
      await presentQuote(
        phone,
        `${kind}:${id}`,
        // Try to look up the friendly name from BotConversation.lastShownOptions
        // is brittle — re-derive from the option payload.
        kind === "merge" ? "شقة عائلية مدمجة" : "الوحدة المختارة",
        quote.data.total,
        quote.data.nights,
      );
      return;
    }
    // Re-prompt softly when free-text arrives at this step.
    await sendBotText(
      phone,
      "اخترْ من القائمة أعلاه أو اضغط *تحدث مع موظف* للمساعدة.",
      { origin: "bot:fallback" },
    );
    return;
  }

  // ─── confirmation buttons ──────────────────────────────────────────
  if (interactiveId?.startsWith(ID_CONFIRM_HOLD)) {
    const [, , , kind, idStr] = interactiveId.split(":"); // bot:confirm:hold:unit:42
    const id = Number(idStr);
    const checkIn = slots.checkIn;
    const checkOut = slots.checkOut;
    const guests = slots.guests;
    if (
      !checkIn ||
      !checkOut ||
      !guests ||
      (kind !== "unit" && kind !== "merge")
    ) {
      await sendMainMenu(phone);
      await advanceBotConversation({ botConvId: conv.id, state: "idle" });
      return;
    }
    const hold = await runTool(
      "createHold",
      { kind: kind as "unit" | "merge", id, checkIn, checkOut, guests },
      ctx,
    );
    if (!hold.ok) {
      await sendBotText(phone, hold.error.message, { origin: "bot:fallback" });
      return;
    }
    const link = await runTool(
      "createPaymentLink",
      { holdId: hold.data.holdId },
      ctx,
    );
    if (!link.ok) {
      // No payment provider — escalate so a human can finish the booking.
      await runTool(
        "escalateToHuman",
        {
          reason: "payment_issue",
          summaryAr:
            `الضيف ثبّت حجزاً (#${hold.data.holdId}) لكن بوابة الدفع غير مهيأة. الرجاء التواصل لإكمال الدفع يدوياً.`,
        },
        ctx,
      );
      await sendBotText(
        phone,
        "ثبّتت الحجز بنجاح ✅ سأحوّلك لزميل بشري لإكمال الدفع. لحظات من فضلك 🙏",
        { origin: "bot:fallback" },
      );
      return;
    }
    await sendBotText(
      phone,
      `🎉 ممتاز! المجموع: ${link.data.amount} ${link.data.currency}\n` +
        `ادفع خلال ${HOLD_TTL_MINUTES} دقيقة عبر هذا الرابط الآمن:\n${link.data.url}\n\n` +
        `بمجرد إتمام الدفع، ستصلك رسالة التأكيد + العقد فوراً.`,
      { origin: "bot:fallback", previewUrl: true },
    );
    return;
  }

  if (interactiveId === ID_CANCEL_HOLD) {
    await sendBotText(
      phone,
      "تمام! 👌 تريد البحث عن خيار آخر؟",
      { origin: "bot:fallback" },
    );
    await advanceBotConversation({
      botConvId: conv.id,
      state: "collecting",
      slotsPatch: { lastShownOptions: [] },
    });
    return;
  }

  // ─── awaiting_payment / confirmed / escalated → polite tail ────────
  if (conv.state === "awaiting_payment") {
    await sendBotText(
      phone,
      "بانتظار إتمام الدفع 💳 إن واجهت مشكلة بالرابط، اضغط *تحدث مع موظف*.",
      { origin: "bot:fallback" },
    );
    return;
  }

  // Default catch-all: re-greet.
  await sendMainMenu(phone);
  await advanceBotConversation({
    botConvId: conv.id,
    state: "greeting",
    outboundAt: now,
  });
}
