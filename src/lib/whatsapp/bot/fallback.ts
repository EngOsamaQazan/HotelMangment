import "server-only";
import { prisma } from "@/lib/prisma";
import { runTool, type ToolContext } from "./tools";
import { advanceBotConversation, readSlots } from "./identity";
import {
  sendBotText,
  sendBotButtons,
  sendBotList,
  sendBotImageByUrl,
} from "./sender";
import { HOLD_TTL_MINUTES } from "@/lib/booking/hold";
import { publicPhotoUrl } from "@/lib/public-image";

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
/** Pressed from the photo-preview bubble — re-shows the option list. */
const ID_BACK_TO_LIST = "bot:back-to-list";
/** Pressed from the photo-preview bubble — proceeds to hold + payment link. */
const ID_PREVIEW_CONFIRM = "bot:preview:confirm";
/** Maximum extra photo bubbles we send before the interactive (Meta limits + UX). */
const PREVIEW_MAX_EXTRA_PHOTOS = 2;

// ───────────────────────────── parsing ────────────────────────────────

/**
 * Accepts "12-05-2026", "12/5/26", "2026-05-12", "12 5 2026" — or the
 * year-less variants "12-05" / "12/5" that guests type the most in chat.
 *
 * For the year-less form we pick the *next* occurrence of (day, month):
 *   • If (day, month) of the current year is still in the future, use it.
 *   • Otherwise roll forward to the same date next year so a guest typing
 *     "20/2" in November doesn't accidentally book in the past.
 */
function parseLooseDate(input: string, now: Date): Date | null {
  const trimmed = input.replace(/[^\d/\-\s]/g, " ").trim();
  // ISO YYYY-MM-DD shortcut
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // DMY (with year)
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
  // DM (no year) — assume current year, roll to next year if already past.
  const dm = /^(\d{1,2})[-/\s](\d{1,2})$/.exec(trimmed);
  if (dm) {
    const [, dStr, mStr] = dm;
    const day = Number(dStr);
    const month = Number(mStr);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year = now.getUTCFullYear();
    let date = new Date(Date.UTC(year, month - 1, day));
    if (Number.isNaN(date.getTime())) return null;
    // If this calendar slot already slid more than 1 day into the past,
    // bump to next year (covers December guests booking February).
    if (date.getTime() < now.getTime() - 86_400_000) {
      year += 1;
      date = new Date(Date.UTC(year, month - 1, day));
    }
    return date;
  }
  return null;
}

/** Pulls "[checkIn] [checkOut] [guests]" from one inbound text blob. */
/**
 * Arabic counting helpers. Guests are commonly written in three forms:
 *   1. Digit + noun:        "2 ضيف"  /  "2 أشخاص"  /  "5 نفر"
 *   2. Dual form (no digit): "شخصين" / "ضيفين" / "اثنين"  → always 2
 *   3. Spelled-out singular: "ثلاثة ضيوف" / "خمس أشخاص"
 * The original regex only handled (1), so guests written naturally were
 * silently dropped and the FSM endlessly re-asked for them. We support
 * all three forms below, in priority order (digit > dual > word).
 */
const ARABIC_NUMBER_WORDS: Array<[RegExp, number]> = [
  [/(?:^|\s|ل|لـ)?(?:شخصين|ضيفين|نفرين|اثنين|اثنان|ثنين)/i, 2],
  [/(?:^|\s|ل|لـ)?(?:ثلاث(?:ة|ه)?)/i, 3],
  [/(?:^|\s|ل|لـ)?(?:أربع(?:ة|ه)?|اربع(?:ة|ه)?)/i, 4],
  [/(?:^|\s|ل|لـ)?(?:خمس(?:ة|ه)?)/i, 5],
  [/(?:^|\s|ل|لـ)?(?:ست(?:ة|ه)?)/i, 6],
  [/(?:^|\s|ل|لـ)?(?:سبع(?:ة|ه)?)/i, 7],
  [/(?:^|\s|ل|لـ)?(?:ثماني(?:ة|ه)?|ثمان)/i, 8],
  [/(?:^|\s|ل|لـ)?(?:تسع(?:ة|ه)?)/i, 9],
  [/(?:^|\s|ل|لـ)?(?:عشر(?:ة|ه)?)/i, 10],
  [/(?:^|\s|ل|لـ)?(?:واحد|شخص واحد|ضيف واحد)/i, 1],
];

function extractGuestCount(text: string): number | undefined {
  // Strip date-like tokens FIRST so "15/5 إلى 19/7 شخصين" doesn't let the
  // digit-noun regex grab "7" (the month) as the guest count just because
  // it happens to sit next to "شخصين". The original code dropped this
  // sanitization and silently quoted 7 guests for a 2-adult booking.
  const sanitized = text
    .replace(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/g, " ") // ISO YYYY-MM-DD
    .replace(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g, " ") // DMY full
    .replace(/\d{1,2}[-/]\d{1,2}\b/g, " "); // bare DD/MM (rest of the year)

  // Form 1 — digit + noun (most reliable).
  const digit = /(\d{1,2})\s*(?:ضيف|ضيوف|أشخاص|اشخاص|شخص|نفر|persons?|guests?|pax|بالغ(?:ين|ون|ان)?)/i.exec(
    sanitized,
  );
  if (digit) {
    const g = Number(digit[1]);
    if (g >= 1 && g <= 20) return g;
  }
  // Forms 2 + 3 — dual / spelled-out (run on sanitized text too so a
  // lingering "شخصين بالغين" still matches without competing dates).
  for (const [re, n] of ARABIC_NUMBER_WORDS) {
    if (re.test(sanitized)) return n;
  }
  // Last resort — a lone "ل" + small number ("لـ 2"). Must NOT match
  // the day/year inside a date token, so we require word boundaries
  // around the digits.
  const loose = /(?:^|\s)(?:ل|لـ)\s*(\d{1,2})(?!\d|[-/])/.exec(sanitized);
  if (loose) {
    const g = Number(loose[1]);
    if (g >= 1 && g <= 20) return g;
  }
  return undefined;
}

function parseSlotsFromText(
  text: string,
  now: Date,
): { checkIn?: Date; checkOut?: Date; guests?: number } {
  const result: { checkIn?: Date; checkOut?: Date; guests?: number } = {};

  const guests = extractGuestCount(text);
  if (guests !== undefined) result.guests = guests;

  // Find dates: support "from X to Y" or simply two date tokens separated by
  // dash / "إلى" / "to". Each side may be a full DMY/ISO OR a year-less DM
  // ("15-05") since that's how most guests actually type in WhatsApp.
  // Order of alternatives matters: full forms first so we never truncate a
  // "15-05-2026" down to "15-05".
  const DATE_TOKEN =
    "(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}|\\d{1,2}[-/]\\d{1,2})";
  const rangeRe = new RegExp(
    `${DATE_TOKEN}\\s*(?:إلى|الى|to|-|–|—)\\s*${DATE_TOKEN}`,
  );
  const rangeMatch = rangeRe.exec(text);
  if (rangeMatch) {
    const a = parseLooseDate(rangeMatch[1], now);
    const b = parseLooseDate(rangeMatch[2], now);
    if (a) result.checkIn = a;
    if (b) result.checkOut = b;
  } else {
    // Single date → assume 1 night.
    const singleRe = new RegExp(DATE_TOKEN);
    const single = singleRe.exec(text);
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
    "ممتاز! متى تريد الإقامة؟ ✨\n\n" +
      "اكتبها بأي صيغة من هذه:\n" +
      "• *15-05-2026 إلى 17-05-2026 لشخصين*\n" +
      "• *15-05-2026 إلى 17-05-2026 لـ 2 ضيف*\n" +
      "• *من 15/5 إلى 17/5 لثلاثة أشخاص*",
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

/**
 * Shared finaliser used by BOTH "confirm after preview" (when photos are
 * present) and the legacy "نعم، أكِّد" button (when there are no photos and
 * we go straight from the option list to the quote bubble).
 *
 * Creates the hold, generates a payment link, sends it as the next bubble.
 * On payment-provider failure it auto-escalates so the guest is never
 * stranded with a stuck hold.
 */
async function executeBookingConfirmation(
  phone: string,
  kind: "unit" | "merge",
  id: number,
  checkIn: string,
  checkOut: string,
  guests: number,
  ctx: ToolContext,
): Promise<void> {
  const hold = await runTool(
    "createHold",
    { kind, id, checkIn, checkOut, guests },
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
}

// ──────────────────── room photo preview helpers ────────────────────────

/**
 * Look up up to N photos for a chosen option:
 *   • kind="unit"  → photos of the underlying UnitType.
 *   • kind="merge" → photos of *both* unit types in the merge (left first),
 *     deduped, capped to 3 to keep the preview lightweight.
 *
 * Returns absolute HTTPS URLs only — this is what Meta needs (it refuses
 * http and refuses relative/auth-gated paths). Internally-stored references
 * like `stored:2026/04/foo.jpg` are rewritten into
 *   <botPublicBaseUrl>/api/files/unit-type-photo/<photoId>
 * which the public file endpoint serves anonymously with cache headers.
 */
async function loadPreviewPhotos(
  kind: "unit" | "merge",
  id: number,
  cap = 3,
): Promise<Array<{ url: string; captionAr: string | null }>> {
  let unitTypeIds: number[] = [];
  if (kind === "unit") {
    unitTypeIds = [id];
  } else {
    // `id` here is a UnitMerge.id — resolve through unitA/unitB → unit_type_id.
    const merge = await prisma.unitMerge
      .findUnique({
        where: { id },
        select: {
          unitA: { select: { unitTypeId: true } },
          unitB: { select: { unitTypeId: true } },
        },
      })
      .catch(() => null);
    const left = merge?.unitA?.unitTypeId ?? null;
    const right = merge?.unitB?.unitTypeId ?? null;
    unitTypeIds = [left, right].filter(
      (n): n is number => typeof n === "number",
    );
  }
  if (unitTypeIds.length === 0) return [];

  // We need both the photo row id (for the public proxy URL) and the bot's
  // public base URL (to produce an absolute https:// link Meta will accept).
  const [rows, cfg] = await Promise.all([
    prisma.unitTypePhoto.findMany({
      where: { unitTypeId: { in: unitTypeIds } },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, url: true, captionAr: true },
      take: cap * 2,
    }),
    prisma.whatsAppConfig.findUnique({
      where: { id: 1 },
      select: { botPublicBaseUrl: true },
    }),
  ]);
  const baseUrl = (cfg?.botPublicBaseUrl ?? "").replace(/\/$/, "");

  const seen = new Set<string>();
  const out: Array<{ url: string; captionAr: string | null }> = [];
  for (const r of rows) {
    // Resolve to the public guest-facing URL (handles both stored: refs and
    // already-absolute https URLs). Returns null when neither id nor url
    // are valid — skip those.
    const resolved = publicPhotoUrl("unit-type-photo", r.id, r.url);
    if (!resolved) continue;

    let absolute: string;
    if (/^https?:\/\//i.test(resolved)) {
      absolute = resolved;
    } else if (baseUrl) {
      // resolved is "/api/files/...". Prepend the configured public host.
      absolute = `${baseUrl}${resolved.startsWith("/") ? "" : "/"}${resolved}`;
    } else {
      // No base URL configured — Meta won't accept a relative path. Skip
      // gracefully so the preview falls back to the no-photo branch.
      continue;
    }

    // Final HTTPS gate: Meta rejects plain http even when reachable.
    if (!/^https:\/\//i.test(absolute)) continue;

    if (seen.has(absolute)) continue;
    seen.add(absolute);
    out.push({ url: absolute, captionAr: r.captionAr ?? null });
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Render the photo-preview step: 0–N standalone image bubbles followed by
 * an interactive bubble with image header (when at least one photo exists)
 * and three reply buttons:
 *   1. "نعم، أكِّد"          → moves to holding + payment link.
 *   2. "اختر غرفة أخرى"     → re-shows the option list, returns to quoting.
 *   3. "تحدث مع موظف"        → escalates to a human agent.
 *
 * If no photos are available we still send the interactive bubble (without
 * the image header) so the guest is never stuck — they get the same three
 * options with a text-only summary.
 */
async function presentRoomPreview(
  phone: string,
  optionName: string,
  total: number,
  nights: number,
  guests: number,
  photos: Array<{ url: string; captionAr: string | null }>,
): Promise<void> {
  // 1) Send extra photos (after the first one, which becomes the header).
  const extraPhotos = photos.slice(1, 1 + PREVIEW_MAX_EXTRA_PHOTOS);
  for (const p of extraPhotos) {
    await sendBotImageByUrl({
      to: phone,
      url: p.url,
      caption: p.captionAr ?? undefined,
      origin: "bot:fallback",
    });
  }

  // 2) Build the interactive bubble. The first photo becomes the header
  // bubble; extras were already sent above as standalone image messages.
  const headerImageUrl = photos[0]?.url;
  const bodyLines = [
    `🏨 *${optionName}*`,
    "",
    `• ${nights} ليلة • ${guests} ${guests === 1 ? "ضيف" : "ضيوف"}`,
    `• المجموع: *${total} د.أ*`,
    "",
    "اختر الإجراء التالي 👇",
  ];

  await sendBotButtons({
    to: phone,
    headerImageUrl,
    headerText: headerImageUrl ? undefined : optionName.slice(0, 60),
    bodyText: bodyLines.join("\n"),
    footerText: `الحجز محجوز لمدة ${HOLD_TTL_MINUTES} دقيقة بعد الدفع`,
    buttons: [
      { id: ID_PREVIEW_CONFIRM, title: "💳 أكِّد ودفع" },
      { id: ID_BACK_TO_LIST, title: "غرفة أخرى" },
      { id: ID_MENU_HUMAN, title: "تحدث مع موظف" },
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

  // ─── Universal RESTART hatch ─────────────────────────────────────────
  // Without this, once the FSM enters quoting/holding it can never come
  // back out via free text — the guest gets a "choose from above" loop
  // even when they obviously want to start over (greeting, "حجز جديد",
  // or a fresh date range typed in). Recognise three escape signals,
  // wipe slots, and route to the appropriate restart point.
  const greetingRe = /^(?:\s*[!.،؟?]?\s*)?(?:السلام\s*عليكم|سلام|مرحبا|مرحبًا|اهلا|أهلاً?|hi|hello|hey|start|بدء|ابدأ)\b/i;
  const newBookingRe = /^(?:\s*)?(?:حجز\s*جديد|حجز|book|new\s*booking|new)\s*$/i;
  const looksLikeDateRequest =
    !!textBody &&
    /\d{1,2}[-/]\d{1,2}/.test(textBody) &&
    !!extractGuestCount(textBody);

  const wantsMenu =
    interactiveId === ID_MENU_BOOK ||
    (textBody !== null && (greetingRe.test(textBody) || newBookingRe.test(textBody)));

  if (
    (conv.state !== "idle" && conv.state !== "done" && conv.state !== "greeting") &&
    (wantsMenu || looksLikeDateRequest)
  ) {
    // Wipe transient picker state so the next round starts clean. We keep
    // checkIn / checkOut / guests around because the guest often retries
    // the same dates after a no-availability bounce — the collecting
    // branch will overwrite them if the new message contains fresh ones.
    await advanceBotConversation({
      botConvId: conv.id,
      state: looksLikeDateRequest ? "collecting" : "idle",
      slotsPatch: {
        lastShownOptions: undefined,
        previewKind: undefined,
        previewId: undefined,
        previewName: undefined,
        previewTotal: undefined,
        previewNights: undefined,
      },
      outboundAt: now,
    });
    // Re-fetch the conversation so downstream sees the clean state. The
    // mutation above doesn't update our local `conv` reference.
    const fresh = await prisma.botConversation.findUniqueOrThrow({
      where: { id: conv.id },
    });
    Object.assign(conv, fresh);
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
      // Tell the guest *exactly* what's still missing so they don't
      // re-send the same message verbatim — the most common cause of
      // a stuck "ما لقطت كل التفاصيل" loop in the wild.
      const missing: string[] = [];
      if (!checkIn) missing.push("تاريخ الوصول");
      if (!checkOut) missing.push("تاريخ المغادرة");
      if (!guests) missing.push("عدد الأشخاص");
      await sendBotText(
        phone,
        `ناقصني: *${missing.join("، ")}* 🙏\n\n` +
          "اكتبها مرة وحدة بأي شكل، مثل:\n" +
          "• *15-05-2026 إلى 17-05-2026 لشخصين*\n" +
          "• *من 15/5 لـ 17/5 لـ 2 ضيف*",
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
      // Resolve a friendly name. For "unit" we hit UnitType; for "merge"
      // we read the cached merge label so the bubble matches the menu row.
      let optionName = "الوحدة المختارة";
      if (kind === "unit") {
        const ut = await prisma.unitType
          .findUnique({ where: { id }, select: { nameAr: true } })
          .catch(() => null);
        if (ut?.nameAr) optionName = ut.nameAr;
      } else {
        const merge = await prisma.unitMerge
          .findUnique({
            where: { id },
            select: {
              unitA: {
                select: { unitTypeRef: { select: { nameAr: true } } },
              },
              unitB: {
                select: { unitTypeRef: { select: { nameAr: true } } },
              },
            },
          })
          .catch(() => null);
        const leftName = merge?.unitA?.unitTypeRef?.nameAr ?? null;
        const rightName = merge?.unitB?.unitTypeRef?.nameAr ?? null;
        if (leftName && rightName) {
          optionName = `${leftName} + ${rightName}`;
        } else {
          optionName = "شقة عائلية مدمجة";
        }
      }

      // Pull up to 3 photos. When NONE are available we skip the preview
      // step entirely and go straight to the legacy quote+confirm bubble —
      // sending an empty "الصور أعلاه" bubble followed by a second confirm
      // bubble was confusing guests in production (they thought the bot
      // was asking for confirmation twice without ever showing photos).
      const photos = await loadPreviewPhotos(kind as "unit" | "merge", id, 3);

      if (photos.length === 0) {
        await presentQuote(
          phone,
          `${kind}:${id}`,
          optionName,
          quote.data.total,
          quote.data.nights,
        );
        await advanceBotConversation({
          botConvId: conv.id,
          state: "holding",
          slotsPatch: {
            previewKind: kind as "unit" | "merge",
            previewId: id,
            previewName: optionName,
            previewTotal: quote.data.total,
            previewNights: quote.data.nights,
          },
          outboundAt: now,
        });
        return;
      }

      await presentRoomPreview(
        phone,
        optionName,
        quote.data.total,
        quote.data.nights,
        guests,
        photos,
      );
      await advanceBotConversation({
        botConvId: conv.id,
        state: "previewing",
        slotsPatch: {
          previewKind: kind as "unit" | "merge",
          previewId: id,
          previewName: optionName,
          previewTotal: quote.data.total,
          previewNights: quote.data.nights,
        },
        outboundAt: now,
      });
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

  // ─── previewing → guest is looking at room photos before confirming ─
  if (conv.state === "previewing") {
    // (a) "اختر غرفة أخرى" → re-fetch availability and re-show the list.
    if (interactiveId === ID_BACK_TO_LIST) {
      const checkIn = slots.checkIn;
      const checkOut = slots.checkOut;
      const guests = slots.guests;
      if (!checkIn || !checkOut || !guests) {
        // Lost the slots somehow — restart cleanly.
        await sendMainMenu(phone);
        await advanceBotConversation({
          botConvId: conv.id,
          state: "idle",
          slotsPatch: {
            previewKind: undefined,
            previewId: undefined,
            previewName: undefined,
            previewTotal: undefined,
            previewNights: undefined,
          },
          outboundAt: now,
        });
        return;
      }
      const result = await runTool(
        "searchAvailability",
        { checkIn, checkOut, guests },
        ctx,
      );
      if (!result.ok) {
        await sendBotText(phone, result.error.message, {
          origin: "bot:fallback",
        });
        return;
      }
      await presentOptions(phone, result.data.options);
      await advanceBotConversation({
        botConvId: conv.id,
        state: "quoting",
        slotsPatch: {
          lastShownOptions: result.data.options.map((o) => o.id),
          previewKind: undefined,
          previewId: undefined,
          previewName: undefined,
          previewTotal: undefined,
          previewNights: undefined,
        },
        outboundAt: now,
      });
      return;
    }

    // (b) "أكِّد ودفع" → jump STRAIGHT to hold + payment link. We deliberately
    // skip the second presentQuote bubble here because the preview bubble the
    // guest just saw already contains the same total — asking them to confirm
    // twice was the most-reported friction in the first round of testing.
    if (interactiveId === ID_PREVIEW_CONFIRM) {
      const previewKind = slots.previewKind;
      const previewId = slots.previewId;
      const checkIn = slots.checkIn;
      const checkOut = slots.checkOut;
      const guests = slots.guests;
      if (
        !previewKind ||
        !previewId ||
        !checkIn ||
        !checkOut ||
        !guests
      ) {
        await sendBotText(
          phone,
          "انقطع التتبّع — لنبدأ من جديد 🙏",
          { origin: "bot:fallback" },
        );
        await advanceBotConversation({
          botConvId: conv.id,
          state: "idle",
          slotsPatch: { lastShownOptions: [] },
        });
        return;
      }
      await executeBookingConfirmation(
        phone,
        previewKind,
        previewId,
        checkIn,
        checkOut,
        guests,
        ctx,
      );
      await advanceBotConversation({
        botConvId: conv.id,
        state: "awaiting_payment",
        outboundAt: now,
      });
      return;
    }

    // (c) Free-text inside previewing — gentle nudge.
    await sendBotText(
      phone,
      "اضغط *أكِّد ودفع* للمتابعة أو *غرفة أخرى* لاختيار وحدة ثانية 👌",
      { origin: "bot:fallback" },
    );
    return;
  }

  // ─── confirmation buttons (no-photo path) ──────────────────────────
  // Reached only when the option had zero photos and we routed straight to
  // `presentQuote` from the option list. Photo-gated guests confirm via
  // ID_PREVIEW_CONFIRM in the previewing block above.
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
    await executeBookingConfirmation(
      phone,
      kind as "unit" | "merge",
      id,
      checkIn,
      checkOut,
      guests,
      ctx,
    );
    await advanceBotConversation({
      botConvId: conv.id,
      state: "awaiting_payment",
      outboundAt: now,
    });
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
