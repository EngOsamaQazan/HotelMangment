import "server-only";

/**
 * Runtime environment loader with validation.
 *
 * نقطة القراءة الموحّدة لكل متغيرات البيئة الخادمية.
 * بدل قراءة `process.env.X` مبعثرة في الكود، استورد من هنا
 * لتحصل على:
 *   • تحقّق تلقائي من القيم المطلوبة وقت البناء/التشغيل.
 *   • رسائل خطأ عربية واضحة عند غياب أي متغيّر.
 *   • تمييز تلقائي بين بيئة التطوير والإنتاج.
 *
 * ترتيب تحميل Next.js:
 *   dev  → .env → .env.development → .env.local → .env.development.local
 *   prod → .env → .env.production  → .env.local → .env.production.local
 *
 * لذا المطوّر ينشئ .env.local ، والسيرفر يستخدم .env فقط.
 */

type Mode = "development" | "production" | "test";

function getMode(): Mode {
  const raw = (process.env.NODE_ENV ?? "development").toLowerCase();
  if (raw === "production") return "production";
  if (raw === "test") return "test";
  return "development";
}

function required(name: string, value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) {
    throw new Error(
      `[env] المتغيّر المطلوب ${name} غير مُعرَّف.\n` +
        `   • محلياً: شغّل "npm run setup:env" أو أضفه إلى .env.local\n` +
        `   • على السيرفر: أضفه إلى /opt/mafhotel.com/shared/.env`,
    );
  }
  return v;
}

function optional(value: string | undefined, fallback = ""): string {
  return (value ?? "").trim() || fallback;
}

function optionalBool(value: string | undefined, fallback = false): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function optionalNumber(value: string | undefined, fallback: number): number {
  const n = Number((value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function assertNotPlaceholder(name: string, value: string): void {
  const bad = [
    "CHANGE_ME",
    "YOUR_PROJECT_REF",
    "YOUR_DB_PASSWORD",
    "PASTE_DB_PASSWORD_FROM_SERVER",
  ];
  for (const token of bad) {
    if (value.includes(token)) {
      throw new Error(
        `[env] القيمة الحالية لـ ${name} تحتوي على قيمة نائبة "${token}".\n` +
          `   استبدلها بالقيمة الحقيقية في .env.local (محلياً) أو .env (إنتاج).`,
      );
    }
  }
}

const MODE: Mode = getMode();

/**
 * تحقّق متساهل: نتحقق فقط عندما نحتاج قيمة فعلاً.
 * السبب: أوامر CLI مثل `prisma generate` قد تستورد الكود بدون DATABASE_URL،
 * فلا نريد كسر البناء.
 */
export const env = {
  /** بيئة التشغيل الحالية. */
  NODE_ENV: MODE,
  isProduction: MODE === "production",
  isDevelopment: MODE === "development",
  isTest: MODE === "test",

  /** رابط قاعدة البيانات (مطلوب عند أول استخدام). */
  get DATABASE_URL(): string {
    const v = required("DATABASE_URL", process.env.DATABASE_URL);
    assertNotPlaceholder("DATABASE_URL", v);
    if (v.startsWith("file:")) {
      throw new Error(
        "[env] المخطط يعتمد على PostgreSQL وليس SQLite. عدّل DATABASE_URL.",
      );
    }
    return v;
  },

  /** سر توقيع جلسات NextAuth (مطلوب). */
  get NEXTAUTH_SECRET(): string {
    const v = required("NEXTAUTH_SECRET", process.env.NEXTAUTH_SECRET);
    if (v.length < 16) {
      throw new Error(
        "[env] NEXTAUTH_SECRET قصير جداً. استخدم 32 حرفاً على الأقل.",
      );
    }
    return v;
  },

  /** رابط التطبيق الرسمي (مطلوب في الإنتاج). */
  get NEXTAUTH_URL(): string {
    if (MODE === "production") {
      return required("NEXTAUTH_URL", process.env.NEXTAUTH_URL);
    }
    return optional(process.env.NEXTAUTH_URL, "http://localhost:3000");
  },

  /** رابط الموقع العام (للـ meta tags). */
  get NEXT_PUBLIC_SITE_URL(): string {
    return optional(
      process.env.NEXT_PUBLIC_SITE_URL,
      MODE === "production"
        ? "https://mafhotel.com"
        : "http://localhost:3000",
    );
  },

  /** مفتاح تشفير بيانات Booking (اختياري — يُشتقّ في dev). */
  get BOOKING_ENC_KEY(): string {
    return optional(process.env.BOOKING_ENC_KEY);
  },

  /** مسار الرفع (اختياري). */
  get UPLOADS_DIR(): string {
    return optional(process.env.UPLOADS_DIR);
  },

  /** منفذ خدمة Realtime. */
  get REALTIME_PORT(): number {
    return optionalNumber(process.env.REALTIME_PORT, 3001);
  },

  /** Host خدمة Realtime. */
  get REALTIME_HOST(): string {
    return optional(process.env.REALTIME_HOST, "127.0.0.1");
  },

  /** تفعيل سجلات تصحيح مصادقة Socket.IO. */
  get REALTIME_DEBUG_AUTH(): boolean {
    return optionalBool(process.env.REALTIME_DEBUG_AUTH, false);
  },

  /** رقم البناء الحالي (أو "dev"). */
  get BUILD_ID(): string {
    return optional(process.env.BUILD_ID, "dev");
  },
} as const;

/**
 * يُستدعى يدوياً عند أولى لحظات الإقلاع للتأكد من أن كل المتغيرات
 * الحرجة متوفرة. استخدمه في entry-points إذا أردت فشلاً مبكراً.
 */
export function assertRuntimeEnv(): void {
  // القراءة عبر getters كافية لتشغيل الـ validation.
  void env.DATABASE_URL;
  void env.NEXTAUTH_SECRET;
  if (env.isProduction) {
    void env.NEXTAUTH_URL;
  }
}
