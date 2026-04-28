import type { Message, ConversationSummary } from "./_types";

/** Parse a fetch Response safely — never throws "Unexpected end of JSON input". */
export async function readJsonSafe<T>(
  res: Response,
  fallbackMsg: string,
): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* not JSON */
    }
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error?: string }).error ?? "")
        : "") ||
      text ||
      `${fallbackMsg} (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return (parsed ?? ([] as unknown)) as T;
}

/** Preview text rendered in the thread list row. */
export function messagePreview(
  lastMessage: ConversationSummary["lastMessage"],
): string {
  if (!lastMessage) return "";
  if (lastMessage.isInternalNote) return `📝 ${lastMessage.body ?? ""}`;
  switch (lastMessage.type) {
    case "template":
      return `📋 قالب: ${lastMessage.body ?? ""}`;
    case "image":
      return "📷 صورة";
    case "document":
      return `📎 ${lastMessage.body ?? "ملف"}`;
    case "audio":
      return "🎵 مقطع صوتي";
    case "video":
      return "🎬 فيديو";
    case "sticker":
      return "🏷️ ملصق";
    case "location":
      return "📍 موقع";
    case "reaction":
      return `💟 ${lastMessage.body ?? ""}`;
    default:
      return lastMessage.body ?? "";
  }
}

export function isReengagementError(
  code: string | null | undefined,
  message: string | null | undefined,
): boolean {
  if (code === "131047") return true;
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("re-engagement") ||
    m.includes("more than 24 hours") ||
    m.includes("24 hour")
  );
}

export function humanizeWaError(
  code: string | null | undefined,
  message: string | null | undefined,
): string {
  if (isReengagementError(code, message))
    return "لم تصل — مضى أكثر من 24 ساعة على آخر رسالة منه، يلزم إرسال قالب معتمد.";
  if (code === "131051" || /unsupported message type/i.test(message ?? ""))
    return "نوع الرسالة غير مدعوم.";
  if (code === "131026" || /recipient.+not.+whatsapp/i.test(message ?? ""))
    return "هذا الرقم غير مسجّل على WhatsApp.";
  if (code === "131056" || /rate.?limit/i.test(message ?? ""))
    return "تجاوزت حد معدل الإرسال مؤقتًا — جرّب لاحقًا.";
  if (code === "190" || /access token/i.test(message ?? ""))
    return "انتهت صلاحية التوكن — راجع «إعدادات واتساب».";
  return message ?? "فشل الإرسال";
}

/** Formatted short date/time — "الآن", "منذ 5د", "أمس"... in Arabic. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `${mins}د`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}س`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}يوم`;
  return d.toLocaleDateString("ar", { month: "short", day: "numeric" });
}

/**
 * Resolve the best name to show for a conversation.
 *
 * Priority:
 *   1. `displayName`     – name set manually by us in the CRM phonebook.
 *   2. `nickname`        – short alias entered by staff.
 *   3. `waProfileName`   – name the customer uses on their own WhatsApp profile
 *                          (captured from `contacts[].profile.name` on every
 *                          inbound webhook). Lets us greet a brand-new contact
 *                          by their real name even before anyone saves them.
 *   4. `+<phone>`        – ultimate fallback.
 */
export function conversationDisplayName(c: ConversationSummary): string {
  return (
    c.contact?.displayName ??
    c.contact?.nickname ??
    c.contact?.waProfileName ??
    `+${c.contactPhone}`
  );
}

/** True when we have any human-readable name (saved or from WhatsApp itself). */
export function conversationHasName(c: ConversationSummary): boolean {
  return Boolean(
    c.contact?.displayName || c.contact?.nickname || c.contact?.waProfileName,
  );
}

/** For "avatar" initials. */
export function initials(name: string): string {
  return name.replace(/^\+?/, "").slice(0, 2).toUpperCase();
}

/** Same notion but for Message list rendering (message bubbles). */
export function messagePreviewShort(m: Message): string {
  switch (m.type) {
    case "template":
      return `📋 ${m.templateName ?? "قالب"}`;
    case "image":
      return "📷 صورة";
    case "document":
      return "📎 مستند";
    case "audio":
      return "🎵 صوت";
    case "video":
      return "🎬 فيديو";
    case "sticker":
      return "🏷️ ملصق";
    case "location":
      return "📍 موقع";
    default:
      return m.body ?? "";
  }
}
