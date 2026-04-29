/**
 * Notification event catalog — the source of truth for the
 * Notification Center and the user-preferences screen.
 *
 * Inspired by Tayseer's `os_notification_event` DB table, but we keep the
 * catalog in code since the hotel app's set of events is small, stable,
 * and ships with the codebase. The DB only stores per-user preferences
 * (overrides) — see `prisma/schema.prisma → NotificationPreference`.
 *
 * Each event is identified by a stable `code` (also written into the
 * `notifications.type` column when the row is persisted) so that
 * preferences keep working across Notification rows that already exist.
 */

export type EventCategory =
  | "reservations"
  | "tasks"
  | "chat"
  | "whatsapp"
  | "finance"
  | "accounting"
  | "maintenance"
  | "system"
  | "security";

export type EventChannel =
  | "in_app"
  | "email"
  | "whatsapp"
  | "web_push"
  | "sound";

export interface EventDef {
  /** Stable, dot-notation code stored in `notifications.type`. */
  code: string;
  /** Arabic display name shown in the preferences UI. */
  nameAr: string;
  /** Short Arabic explanation of when this event fires. */
  descriptionAr: string;
  category: EventCategory;
  /** Default delivery channels when the user has no preference row. */
  defaultChannels: EventChannel[];
  /** Critical events cannot be muted (e.g. security). */
  isCritical?: boolean;
  /**
   * When false the event still flows through dispatch but is hidden from
   * the user-preferences UI (system/internal events). Defaults to true.
   */
  isUserFacing?: boolean;
  /** Default UI priority bucket (0=normal, 1=high, 2=urgent). */
  defaultPriority?: 0 | 1 | 2;
}

/**
 * The full catalog. ORDER MATTERS — it's the order events appear inside
 * each category in the preferences accordion.
 */
export const EVENTS: EventDef[] = [
  // ─── Reservations ─────────────────────────────────────────────
  {
    code: "reservation.created",
    nameAr: "حجز جديد",
    descriptionAr: "إنشاء حجز جديد (موظف الاستقبال أو من الموقع).",
    category: "reservations",
    defaultChannels: ["in_app", "web_push"],
  },
  {
    code: "reservation.online",
    nameAr: "حجز إلكتروني عبر الموقع",
    descriptionAr: "وصول حجز جديد من نموذج الحجز المباشر على mafhotel.com.",
    category: "reservations",
    defaultChannels: ["in_app", "web_push", "sound"],
    defaultPriority: 1,
  },
  {
    code: "reservation.checkin",
    nameAr: "تسجيل دخول ضيف",
    descriptionAr: "ضيف سجَّل دخوله إلى الفندق.",
    category: "reservations",
    defaultChannels: ["in_app"],
  },
  {
    code: "reservation.checkout",
    nameAr: "تسجيل مغادرة ضيف",
    descriptionAr: "ضيف سجَّل مغادرته من الفندق.",
    category: "reservations",
    defaultChannels: ["in_app"],
  },
  {
    code: "reservation.cancelled",
    nameAr: "إلغاء حجز",
    descriptionAr: "إلغاء حجز قائم.",
    category: "reservations",
    defaultChannels: ["in_app", "web_push"],
  },
  {
    code: "reservation.no_show",
    nameAr: "حجز لم يحضر",
    descriptionAr: "تم وضع علامة \"لم يحضر\" على حجز.",
    category: "reservations",
    defaultChannels: ["in_app"],
  },

  // ─── Tasks ─────────────────────────────────────────────────────
  {
    code: "task.assigned",
    nameAr: "إسناد مهمة",
    descriptionAr: "تم إسناد مهمة جديدة إليك.",
    category: "tasks",
    defaultChannels: ["in_app", "web_push"],
  },
  {
    code: "task.due",
    nameAr: "اقتراب موعد مهمة",
    descriptionAr: "اقتراب موعد استحقاق مهمة موكلة إليك.",
    category: "tasks",
    defaultChannels: ["in_app", "web_push"],
    defaultPriority: 1,
  },
  {
    code: "task.commented",
    nameAr: "تعليق على مهمة",
    descriptionAr: "أحد الأعضاء أضاف تعليقًا على مهمة تتابعها.",
    category: "tasks",
    defaultChannels: ["in_app"],
  },
  {
    code: "task.completed",
    nameAr: "إنجاز مهمة",
    descriptionAr: "تم إنجاز مهمة كنت موكَّلًا بها.",
    category: "tasks",
    defaultChannels: ["in_app"],
  },

  // ─── Chat ─────────────────────────────────────────────────────
  {
    code: "chat.message",
    nameAr: "رسالة محادثة جديدة",
    descriptionAr: "رسالة جديدة في محادثة داخلية.",
    category: "chat",
    defaultChannels: ["in_app", "web_push", "sound"],
  },
  {
    code: "chat.mention",
    nameAr: "تنبيه ذكري في محادثة",
    descriptionAr: "ذكرك أحدهم بـ @ داخل محادثة.",
    category: "chat",
    defaultChannels: ["in_app", "web_push", "sound"],
    defaultPriority: 1,
  },

  // ─── WhatsApp ─────────────────────────────────────────────────
  {
    code: "whatsapp.message",
    nameAr: "رسالة واتساب جديدة",
    descriptionAr: "رسالة وردت من عميل عبر واتساب.",
    category: "whatsapp",
    defaultChannels: ["in_app", "web_push", "sound"],
  },
  {
    code: "whatsapp.unassigned",
    nameAr: "محادثة واتساب غير مسندة",
    descriptionAr: "محادثة واتساب جديدة بحاجة لإسناد إلى موظف.",
    category: "whatsapp",
    defaultChannels: ["in_app", "web_push"],
    defaultPriority: 1,
  },
  {
    code: "whatsapp.assigned",
    nameAr: "إسناد محادثة واتساب",
    descriptionAr: "تم إسناد محادثة واتساب إليك.",
    category: "whatsapp",
    defaultChannels: ["in_app", "web_push"],
  },

  // ─── Maintenance ─────────────────────────────────────────────
  {
    code: "maintenance.created",
    nameAr: "طلب صيانة جديد",
    descriptionAr: "تم إنشاء طلب صيانة جديد.",
    category: "maintenance",
    defaultChannels: ["in_app"],
  },
  {
    code: "maintenance.completed",
    nameAr: "اكتمال طلب صيانة",
    descriptionAr: "تم إنهاء طلب صيانة.",
    category: "maintenance",
    defaultChannels: ["in_app"],
  },

  // ─── Finance / Accounting ─────────────────────────────────────
  {
    code: "finance.payment",
    nameAr: "تسجيل دفعة",
    descriptionAr: "تسجيل دفعة من ضيف أو طرف.",
    category: "finance",
    defaultChannels: ["in_app"],
  },
  {
    code: "accounting.journal_posted",
    nameAr: "ترحيل قيد محاسبي",
    descriptionAr: "تم ترحيل قيد محاسبي.",
    category: "accounting",
    defaultChannels: ["in_app"],
  },
  {
    code: "accounting.period_closed",
    nameAr: "إقفال فترة محاسبية",
    descriptionAr: "تم إقفال فترة محاسبية.",
    category: "accounting",
    defaultChannels: ["in_app"],
    defaultPriority: 1,
  },

  // ─── Security ─────────────────────────────────────────────────
  {
    code: "security.login",
    nameAr: "تسجيل دخول جديد",
    descriptionAr: "تنبيه أمان عند تسجيل دخول جديد إلى حسابك.",
    category: "security",
    defaultChannels: ["in_app", "email"],
    isCritical: true,
    defaultPriority: 2,
  },
  {
    code: "security.password_changed",
    nameAr: "تغيير كلمة المرور",
    descriptionAr: "تنبيه عند تغيير كلمة المرور لحسابك.",
    category: "security",
    defaultChannels: ["in_app", "email"],
    isCritical: true,
    defaultPriority: 2,
  },

  // ─── System ───────────────────────────────────────────────────
  {
    code: "system.announcement",
    nameAr: "إعلان من إدارة النظام",
    descriptionAr: "إعلانات عامة من مدير النظام لكل المستخدمين.",
    category: "system",
    defaultChannels: ["in_app", "web_push"],
  },
];

/** Map by code for O(1) lookups. */
export const EVENT_BY_CODE: Record<string, EventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.code, e]),
);

/** Convenience getter — returns the event def OR a graceful fallback. */
export function getEvent(code: string): EventDef | undefined {
  return EVENT_BY_CODE[code];
}

/** All distinct categories preserving the catalog order. */
export function listCategories(): EventCategory[] {
  const seen = new Set<EventCategory>();
  const out: EventCategory[] = [];
  for (const e of EVENTS) {
    if (!seen.has(e.category)) {
      seen.add(e.category);
      out.push(e.category);
    }
  }
  return out;
}

export const CATEGORY_LABELS: Record<EventCategory, { label: string; icon: string }> = {
  reservations: { label: "الحجوزات", icon: "calendar-check" },
  tasks: { label: "المهام", icon: "list-checks" },
  chat: { label: "المحادثات الداخلية", icon: "message-square" },
  whatsapp: { label: "واتساب", icon: "message-circle" },
  maintenance: { label: "الصيانة", icon: "wrench" },
  finance: { label: "المالية", icon: "wallet" },
  accounting: { label: "المحاسبة", icon: "calculator" },
  security: { label: "الأمان", icon: "shield" },
  system: { label: "النظام", icon: "settings" },
};
