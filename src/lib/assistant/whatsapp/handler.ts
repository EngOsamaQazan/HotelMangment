import "server-only";
import { prisma } from "@/lib/prisma";
import { sendBotButtons, sendBotText } from "@/lib/whatsapp/bot/sender";
import { runAssistantTurn } from "@/lib/assistant/engine";
import { executeAssistantAction, rejectAssistantAction } from "@/lib/assistant/executor";
import {
  findActiveSession,
  findStaffByPhone,
  issueOtp,
  bumpActivity,
  revokeSession,
  verifyOtp,
} from "./session";
import {
  buildActionButtons,
  formatActionBodyForButtons,
  formatActionForWhatsApp,
  parseActionCommand,
  parseButtonReply,
  parseSessionCommand,
} from "./formatter";
import { transcribeWhatsAppAudio } from "./transcription";

/**
 * State machine that handles every inbound WhatsApp message coming from a
 * registered staff phone number. The webhook → gateway → here.
 *
 *   pending_otp  ← any unauthenticated message → send a fresh OTP and wait
 *   active       ← the staff types the 6-digit code → kick off the engine
 *   active       ← already authenticated → forward to the assistant engine
 *
 * Side-channel commands ("خروج"/"logout", "أكّد A12"/"ألغِ A12") are
 * intercepted before the LLM sees them so a confirmation never costs a
 * model turn.
 */

const ORIGIN = "bot:staff-assistant";

export interface HandleStaffWaInput {
  staffUserId: number;
  phone: string;
  body: string | null;
  type: string;
  mediaId?: string | null;
  mediaMimeType?: string | null;
  whatsappMessageId?: number | null;
  receivedAt: Date;
  conversationId: number | null;
  /**
   * Optional outbound capture. When provided, outgoing WhatsApp text is
   * pushed into this array instead of (or in addition to) being delivered
   * via `sendBotText`. Used by the sandbox tester at
   * `/api/assistant/wa/sandbox` so operators can debug the staff flow on
   * localhost without a public webhook URL or a real outbound message.
   */
  capture?: string[];
  /**
   * When true, outbound messages are ONLY captured — the WhatsApp Cloud
   * API is not contacted at all. Defaults to false (production behaviour).
   */
  dryRun?: boolean;
}

export interface HandleStaffWaResult {
  replied: boolean;
  reason?: string;
  /** Mirror of `capture` for callers that didn't pre-allocate the array. */
  captured?: string[];
  /**
   * IDs of `AssistantAction` rows created during this turn. The sandbox UI
   * uses this to fetch and render rich draft cards instead of the plain-text
   * WhatsApp summaries — production callers can ignore it.
   */
  pendingActionIds?: number[];
  /** Conversation row backing this turn (created on first authenticated message). */
  conversationId?: number | null;
}

async function send(input: HandleStaffWaInput, text: string): Promise<void> {
  if (input.capture) input.capture.push(text);
  if (!input.dryRun) {
    await sendBotText(input.phone, text, { origin: ORIGIN });
  }
}

async function transcribeAudioMessage(input: HandleStaffWaInput): Promise<string | null> {
  if (!input.mediaId) {
    await send(input, "وصلني تسجيل صوتي بدون ملف قابل للتحميل. أعد إرساله أو اكتب طلبك نصياً.");
    return null;
  }

  const result = await transcribeWhatsAppAudio(input.mediaId);
  if (!result.ok) {
    await send(input, audioTranscriptionFailureText(result.error));
    return null;
  }

  if (input.whatsappMessageId) {
    try {
      await prisma.whatsAppMessage.update({
        where: { id: input.whatsappMessageId },
        data: {
          body: `[تفريغ صوتي]\n${result.text}`,
          mediaMimeType: input.mediaMimeType ?? undefined,
        },
      });
    } catch (error) {
      console.warn("[assistant/wa] failed to persist audio transcript", error);
    }
  }

  return result.text;
}

/**
 * Send an action draft as an Interactive Button message — the closest
 * native WhatsApp equivalent of the React `ActionDraftCard`. The body
 * carries the formatted journal/reservation/etc. summary; two reply
 * buttons let the staff member tap "تأكيد" or "إلغاء" without typing
 * the action id.
 *
 * In dry-run mode (sandbox) we still capture the same text fallback so
 * the operator can debug the message structure.
 */
async function sendActionDraft(
  input: HandleStaffWaInput,
  action: import("@prisma/client").AssistantAction,
): Promise<void> {
  const body = formatActionBodyForButtons(action);
  if (input.capture) input.capture.push(body);
  if (input.dryRun) return;
  try {
    await sendBotButtons({
      to: input.phone,
      bodyText: body,
      buttons: buildActionButtons(action.id),
      origin: ORIGIN,
    });
  } catch (e) {
    // Fallback: if interactive messages fail (rare — usually means the
    // template/window expired), drop down to a plain text version that
    // still includes "أكّد A12" instructions.
    console.warn("[assistant/wa] interactive button send failed, falling back to text", e);
    await sendBotText(input.phone, formatActionForWhatsApp(action), { origin: ORIGIN });
  }
}

export async function handleStaffWaMessage(
  input: HandleStaffWaInput,
): Promise<HandleStaffWaResult> {
  // Interactive button replies arrive as `type=interactive`, body=`id|title`.
  // We treat them the same as text for downstream parsing but try the
  // button-payload parser first because it's authoritative.
  if (input.type === "interactive" && input.body) {
    const btn = parseButtonReply(input.body);
    if (btn) {
      const cfg = await prisma.whatsAppConfig.findUnique({
        where: { id: 1 },
        select: { assistantWaSessionMinutes: true, assistantWaEnabled: true },
      });
      if (cfg && !cfg.assistantWaEnabled) {
        return { replied: false, reason: "wa_assistant_disabled", captured: input.capture };
      }
      const sessionMinutes = cfg?.assistantWaSessionMinutes ?? 30;
      const session = await findActiveSession({ phone: input.phone, sessionMinutes });
      if (!session) {
        // The button must come from a draft we previously sent inside an
        // active session — if the session expired, bounce them to the OTP
        // path again (any next inbound will trigger a new code).
        await send(input, "انتهت الجلسة. أرسل أي رسالة لإصدار رمز جديد ثم أعد المحاولة.");
        return { replied: true, reason: "btn_no_session", captured: input.capture };
      }
      await bumpActivity(session.id);
      return await handleActionCommand({
        session,
        input,
        kind: btn.kind,
        actionId: btn.actionId,
      });
    }
    // Unknown interactive payload — fall through to the standard parser.
  }

  // We only care about text-like content for the assistant. Audio is first
  // transcribed to text, then routed through the same command/LLM path.
  if (input.type !== "text" && input.type !== "interactive" && input.type !== "audio") {
    await send(input, "أستقبل النصوص فقط حالياً. أرسل طلبك مكتوباً من فضلك.");
    return { replied: true, reason: "non_text", captured: input.capture };
  }
  if (!input.body && input.type !== "audio") {
    return { replied: false, reason: "empty_body", captured: input.capture };
  }
  const body = (input.body ?? "").trim();
  if (!body && input.type !== "audio") {
    return { replied: false, reason: "empty_body", captured: input.capture };
  }

  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: {
      assistantWaEnabled: true,
      assistantWaSessionMinutes: true,
      assistantWaMaxSessionHours: true,
    },
  });
  if (cfg && !cfg.assistantWaEnabled) {
    return { replied: false, reason: "wa_assistant_disabled", captured: input.capture };
  }
  const sessionMinutes = cfg?.assistantWaSessionMinutes ?? 30;
  const maxSessionHours = cfg?.assistantWaMaxSessionHours ?? 8;

  // ── 1. Active session? ─────────────────────────────────────────────
  const session = await findActiveSession({ phone: input.phone, sessionMinutes });
  if (session) {
    const effectiveBody =
      input.type === "audio" ? await transcribeAudioMessage(input) : body;
    if (!effectiveBody) {
      return { replied: true, reason: "audio_transcription_failed", captured: input.capture };
    }
    return await handleAuthenticated({
      session,
      input,
      body: effectiveBody,
      sessionMinutes,
    });
  }

  // ── 2. No active session: maybe the message IS the OTP code ────────
  const codeMatch = body.match(/\b(\d{6})\b/);
  if (codeMatch) {
    const result = await verifyOtp({ phone: input.phone, code: codeMatch[1] });
    if (result.ok) {
      const staff = await findStaffByPhone(input.phone);
      const greeting = `أهلاً ${staff?.name ?? ""}! تم التحقق. الجلسة سارية لـ ${sessionMinutes} دقيقة من آخر نشاط. اكتب طلبك أو "مساعدة" لمعرفة المتاح. اكتب "خروج" لإنهاء الجلسة.`;
      await send(input, greeting.trim());
      return { replied: true, reason: "otp_verified", captured: input.capture };
    }
    await send(input, otpFailureText(result.reason));
    return { replied: true, reason: `otp_${result.reason}`, captured: input.capture };
  }

  // ── 3. No active session, no code: send a fresh OTP ───────────────
  const otp = await issueOtp({
    userId: input.staffUserId,
    phone: input.phone,
    sessionMinutes,
    maxSessionHours,
  });
  const text = [
    `*رمز الدخول للمساعد الذكي*`,
    `${otp.code}`,
    ``,
    `صالح لمدة 60 ثانية. أرسل الرمز لإكمال تسجيل الدخول.`,
    `لا تشارك هذا الرمز مع أحد — حتى لو ادّعى أنه من إدارة الفندق.`,
  ].join("\n");
  await send(input, text);
  return { replied: true, reason: "otp_issued", captured: input.capture };
}

// ──────────────────────── authenticated path ────────────────────────

async function handleAuthenticated(args: {
  session: { id: number; userId: number; conversationId: number | null };
  input: HandleStaffWaInput;
  body: string;
  sessionMinutes: number;
}): Promise<HandleStaffWaResult> {
  const { session, input, body } = args;
  await bumpActivity(session.id);

  // Sub-commands first.
  const sessionCmd = parseSessionCommand(body);
  if (sessionCmd === "logout") {
    await revokeSession({ sessionId: session.id, reason: "user_logout" });
    await send(input, "تم إنهاء الجلسة. أرسل أي رسالة لتلقّي رمز جديد.");
    return { replied: true, reason: "logout", captured: input.capture };
  }
  if (sessionCmd === "help") {
    await send(input, helpText(args.sessionMinutes));
    return { replied: true, reason: "help", captured: input.capture };
  }
  const actionCmd = parseActionCommand(body);
  if (actionCmd) {
    return await handleActionCommand({
      session,
      input,
      kind: actionCmd.kind,
      actionId: actionCmd.actionId,
    });
  }

  // ── Forward to the same assistant engine the web UI uses ──────────
  const conversationId = await ensureConversation(session, input.staffUserId);
  const staff = await findStaffByPhone(input.phone);
  const result = await runAssistantTurn({
    conversationId,
    userId: session.userId,
    staffName: staff?.name ?? "الموظف",
    userMessage: body,
  });

  // Mark every action created in this turn with source="wa" so audit/UI can
  // distinguish later (the web UI already opens with source="web" by default).
  if (result.pendingActionIds.length > 0) {
    await prisma.assistantAction.updateMany({
      where: { id: { in: result.pendingActionIds } },
      data: { source: "wa" },
    });
  }

  // Send the assistant's natural-language reply first (always, including
  // dry-run — it's the prose answer to the user's question).
  if (result.text) {
    await send(input, result.text);
  }

  // For each draft we send a native WhatsApp Interactive Button message —
  // the closest thing to the React `ActionDraftCard` used on the web UI:
  // a single bubble carrying the journal/reservation/etc. body plus two
  // reply buttons ("تأكيد" / "إلغاء") so the staff doesn't have to type
  // "أكّد Axx". In dry-run mode (sandbox) we skip the actual send — the
  // UI renders the rich React card directly from `pendingActionIds`.
  if (result.pendingActionIds.length > 0 && !input.dryRun) {
    const actions = await prisma.assistantAction.findMany({
      where: { id: { in: result.pendingActionIds } },
      orderBy: { id: "asc" },
    });
    for (const a of actions) {
      await sendActionDraft(input, a);
    }
  }

  return {
    replied: true,
    reason: result.mode,
    captured: input.capture,
    pendingActionIds: result.pendingActionIds,
    conversationId,
  };
}

async function handleActionCommand(args: {
  session: { id: number; userId: number };
  input: HandleStaffWaInput;
  kind: "confirm" | "reject";
  actionId: number;
}): Promise<HandleStaffWaResult> {
  const { session, input, kind, actionId } = args;
  const fn = kind === "confirm" ? executeAssistantAction : rejectAssistantAction;
  const r = await fn(actionId, session.userId);
  if (!r.ok) {
    await send(input, `تعذّر تنفيذ الأمر على المسودة A${actionId}: ${r.message}`);
    return { replied: true, reason: r.errorCode ?? "command_failed", captured: input.capture };
  }
  await send(input, r.message);
  return { replied: true, reason: kind, captured: input.capture };
}

// ─────────────────────── helpers ───────────────────────

async function ensureConversation(
  session: { id: number; conversationId: number | null },
  userId: number,
): Promise<number> {
  if (session.conversationId) return session.conversationId;
  const conv = await prisma.assistantConversation.create({
    data: { userId, title: "محادثة واتس" },
    select: { id: true },
  });
  await prisma.assistantWaSession.update({
    where: { id: session.id },
    data: { conversationId: conv.id },
  });
  return conv.id;
}

function otpFailureText(reason: string): string {
  switch (reason) {
    case "no_pending":
      return "لا يوجد رمز فعّال. أرسل أي رسالة لإصدار رمز جديد.";
    case "expired":
      return "انتهت صلاحية الرمز. أرسل أي رسالة للحصول على رمز جديد.";
    case "mismatch":
      return "الرمز غير صحيح. أعد المحاولة، أو أرسل أي رسالة جديدة لإصدار رمز.";
    case "locked":
      return "تم قفل الجلسة لعدد محاولات فاشلة. حاول لاحقاً بعد 15 دقيقة.";
    case "too_many":
      return "تجاوزت عدد المحاولات المسموح. تم القفل لمدة 15 دقيقة.";
    default:
      return "تعذّر التحقق من الرمز. حاول لاحقاً.";
  }
}

function audioTranscriptionFailureText(reason: string): string {
  switch (reason) {
    case "missing_key":
      return "لا أستطيع تفريغ التسجيل حالياً لأن مفتاح OpenAI غير مضبوط. اكتب طلبك نصياً أو راجع إعدادات المساعد.";
    case "unsupported_provider":
      return "تفريغ التسجيلات الصوتية متاح حالياً مع OpenAI فقط. اكتب طلبك نصياً من فضلك.";
    case "too_large":
      return "التسجيل الصوتي كبير جداً للتفريغ. أرسل مقطعاً أقصر أو اكتب طلبك نصياً.";
    case "empty":
      return "لم أستطع استخراج نص واضح من التسجيل. أعد التسجيل بصوت أوضح أو اكتب طلبك نصياً.";
    case "no_audio_access":
      return "مفتاح OpenAI الحالي غير مفعّل عليه نماذج تفريغ الصوت (whisper-1 / gpt-4o-transcribe). فعّلها من إعدادات المشروع على platform.openai.com ثم أعد المحاولة. حالياً أكمل بالنص من فضلك.";
    default:
      return "تعذّر تفريغ التسجيل الصوتي الآن. جرّب مرة أخرى أو اكتب طلبك نصياً.";
  }
}

function helpText(sessionMinutes: number): string {
  return [
    "أنا مساعدك الذكي عبر الواتس. تستطيع:",
    "- صياغة قيد محاسبي بطلب طبيعي ('اصرف 50 دينار حق ضيافة')",
    "- إنشاء حجز ('احجز للضيف خالد غرفة 305 ليلتين')",
    "- صرف سلفة، طلب صيانة، إنشاء مهمة، تغيير حالة غرفة",
    "- الإجابة على 'كيف أفعل كذا في النظام؟'",
    "",
    `الجلسة سارية ${sessionMinutes}د من آخر نشاط — عند الانتهاء نرسل رمزاً جديداً.`,
    "اكتب 'خروج' في أي وقت لإنهاء الجلسة فوراً.",
    "كل عملية كتابة تُنشئ مسودة تتلقاها برسالة منفصلة، ولا تُنفّذ إلا بعد ردّك بـ 'أكّد Axx'.",
  ].join("\n");
}
