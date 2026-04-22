import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import {
  verifyOtp,
  signSignupToken,
  type OtpPurpose,
} from "@/lib/guest-auth/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/guest-auth/otp/verify
 * Body: { phone, code, purpose }
 *
 * Success → 200 { ok: true, signupToken } — a 10-min HMAC-signed JWT that
 * must accompany the subsequent /signup, /forgot-reset, or /change-phone
 * call. The token is the ONLY evidence of phone ownership — we must not
 * reissue it without re-verification.
 *
 * Bad code → 400 with a specific reason code so the UI can render an
 * actionable message (expired, too_many, mismatch, ...).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
      code?: string;
      purpose?: string;
    };

    const phone = normalizePhone(body.phone ?? "");
    const purpose = body.purpose as OtpPurpose | undefined;
    const code = String(body.code ?? "").trim();

    if (!phone || !code || !purpose) {
      return NextResponse.json(
        { error: "بيانات الطلب غير كاملة" },
        { status: 400 },
      );
    }
    if (!["signup", "login", "reset", "change_phone"].includes(purpose)) {
      return NextResponse.json(
        { error: "نوع الطلب غير مدعوم" },
        { status: 400 },
      );
    }

    const ip = clientIp(request);
    const limit = rateLimit({
      key: `otp:verify:ip:${ip}`,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد محاولات التحقّق كبير. حاول لاحقاً." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      );
    }

    const result = await verifyOtp({ phone, code, purpose });
    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found: "لا يوجد رمز نشط لهذا الرقم. أعد إرساله.",
        expired: "انتهت صلاحية الرمز. أرسل رمزاً جديداً.",
        consumed: "تم استخدام هذا الرمز بالفعل.",
        mismatch: "الرمز غير صحيح.",
        too_many: "تجاوزت عدد المحاولات المسموح بها. أرسل رمزاً جديداً.",
      };
      return NextResponse.json(
        { error: messages[result.reason ?? "mismatch"], reason: result.reason },
        { status: 400 },
      );
    }

    // Map OTP purpose → signup-token kind. The caller trades this short-
    // lived token for either a GuestAccount (signup), a password update
    // (reset), a phone rebind (change_phone), or a NextAuth session
    // (login — see the `otpToken` branch in `guest-credentials`).
    const signupToken = signSignupToken(phone, purpose);
    return NextResponse.json({ ok: true, signupToken });
  } catch (error) {
    console.error("POST /api/guest-auth/otp/verify error:", error);
    return NextResponse.json({ error: "تعذّر التحقّق من الرمز" }, { status: 500 });
  }
}
