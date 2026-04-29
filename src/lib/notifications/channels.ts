/**
 * Notification delivery channels — the matrix axis paired with `events.ts`.
 *
 * Channels are intentionally simple labels here. The actual delivery
 * adapters live elsewhere (web push → `src/lib/push/server.ts`,
 * in-app → `prisma.notification.create()`, sound → client-side hook).
 *
 * Email and WhatsApp channels are declared but currently no-op senders —
 * the preferences UI exposes the toggles so we can plug in concrete
 * adapters later without redesigning the schema.
 */

export type EventChannel =
  | "in_app"
  | "email"
  | "whatsapp"
  | "web_push"
  | "sound";

export interface ChannelDef {
  key: EventChannel;
  nameAr: string;
  descriptionAr: string;
  /** lucide-react icon name */
  icon: string;
  /** Hex/CSS color used for the channel card accent in preferences UI. */
  color: string;
  /**
   * When true the channel is shown as "قريبًا" (badge) and the toggle is
   * informational only — turning it on/off persists but no real delivery
   * happens until an adapter is wired in.
   */
  comingSoon?: boolean;
}

export const CHANNELS: ChannelDef[] = [
  {
    key: "in_app",
    nameAr: "داخل النظام",
    descriptionAr: "الجرس داخل لوحة التحكم ومركز الإشعارات.",
    icon: "bell",
    color: "#7367f0",
  },
  {
    key: "web_push",
    nameAr: "إشعارات المتصفح",
    descriptionAr: "إشعارات منبثقة من المتصفح حتى لو كان مغلقًا.",
    icon: "monitor-smartphone",
    color: "#ea5455",
  },
  {
    key: "sound",
    nameAr: "تنبيه صوتي",
    descriptionAr: "نغمة قصيرة عند وصول إشعار جديد داخل الموقع.",
    icon: "volume-2",
    color: "#00cfe8",
  },
  {
    key: "whatsapp",
    nameAr: "واتساب",
    descriptionAr: "إرسال إشعارات إلى رقم واتساب الشخصي للموظف.",
    icon: "message-circle",
    color: "#25d366",
  },
  {
    key: "email",
    nameAr: "البريد الإلكتروني",
    descriptionAr: "إشعارات على بريدك الإلكتروني.",
    icon: "mail",
    color: "#ff9f43",
    comingSoon: true,
  },
];

export const CHANNEL_BY_KEY: Record<EventChannel, ChannelDef> = Object.fromEntries(
  CHANNELS.map((c) => [c.key, c]),
) as Record<EventChannel, ChannelDef>;

/** All channel keys — the order used in the preferences UI. */
export const CHANNEL_KEYS: EventChannel[] = CHANNELS.map((c) => c.key);

export const DIGEST_MODES = [
  { key: "instant", label: "فوراً" },
  { key: "hourly", label: "ملخص كل ساعة" },
  { key: "daily", label: "ملخص يومي" },
  { key: "weekly", label: "ملخص أسبوعي" },
] as const;

export type DigestMode = (typeof DIGEST_MODES)[number]["key"];
