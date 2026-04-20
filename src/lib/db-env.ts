import { NextResponse } from "next/server";

/**
 * يتحقق من سلامة إعداد DATABASE_URL قبل أي طلب يحتاج قاعدة البيانات.
 * يعيد `NextResponse` بخطأ 503 مع رسالة عربية واضحة عند وجود مشكلة،
 * أو `null` إذا كان الإعداد سليماً.
 */
export function databaseConfigurationError(): NextResponse | null {
  const url = process.env.DATABASE_URL?.trim() ?? "";

  if (!url) {
    return NextResponse.json(
      {
        error:
          "لم يُضبط DATABASE_URL. شغّل \"npm run setup:env\" محلياً، أو أضف القيمة إلى /opt/hotel-app/.env على السيرفر.",
      },
      { status: 503 },
    );
  }

  if (url.startsWith("file:")) {
    return NextResponse.json(
      {
        error:
          "المخطط يعتمد على PostgreSQL. غيّر DATABASE_URL إلى رابط Postgres صالح (ليس مسار SQLite).",
      },
      { status: 503 },
    );
  }

  const placeholders = [
    "CHANGE_ME",
    "YOUR_PROJECT_REF",
    "YOUR_DB_PASSWORD",
    "PASTE_DB_PASSWORD_FROM_SERVER",
  ];
  for (const token of placeholders) {
    if (url.includes(token)) {
      return NextResponse.json(
        {
          error: `DATABASE_URL ما زال يحتوي القيمة النائبة "${token}". استبدلها بالقيمة الحقيقية ثم أعد التشغيل.`,
        },
        { status: 503 },
      );
    }
  }

  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    return NextResponse.json(
      {
        error:
          "DATABASE_URL ليس رابط PostgreSQL صالحاً. يجب أن يبدأ بـ postgresql:// أو postgres://",
      },
      { status: 503 },
    );
  }

  return null;
}
