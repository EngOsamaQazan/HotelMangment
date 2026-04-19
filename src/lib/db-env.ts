import { NextResponse } from "next/server";

/** يعيد استجابة خطأ إن كان DATABASE_URL غير مهيأ؛ وإلا null. */
export function databaseConfigurationError(): NextResponse | null {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) {
    return NextResponse.json(
      { error: "لم يُضبط DATABASE_URL في ملف .env في جذر المشروع." },
      { status: 503 }
    );
  }
  if (url.startsWith("file:")) {
    return NextResponse.json(
      {
        error:
          "المخطط يعتمد على PostgreSQL. عيّن DATABASE_URL من Supabase (Connection string) وليس مسار SQLite.",
      },
      { status: 503 }
    );
  }
  if (
    url.includes("YOUR_PROJECT_REF") ||
    url.includes("YOUR_DB_PASSWORD") ||
    url.includes("PASTE_DB_PASSWORD_FROM_SERVER")
  ) {
    return NextResponse.json(
      {
        error:
          "استبدل القيم النائبة في DATABASE_URL: إما رابط Supabase من لوحة المشروع، أو (للتطوير عبر نفق) انسخ كلمة مرور fakher_user من /opt/hotel-app/.env على السيرفر والصقها مكان PASTE_DB_PASSWORD_FROM_SERVER ثم أعد تشغيل npm run dev.",
      },
      { status: 503 }
    );
  }
  return null;
}
