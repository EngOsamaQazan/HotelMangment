import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { verifySignupToken } from "@/lib/guest-auth/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/guest-auth/signup
 * Body: { signupToken, fullName, password, email?, nationality?, preferredLang? }
 *
 * Flow: the client has already verified phone ownership via
 *   /api/guest-auth/otp/start + /otp/verify and received a short-lived
 *   `signupToken`. This endpoint trades that token for a persistent
 *   `GuestAccount` row and returns the phone + a hint to call
 *   `signIn("guest-credentials", { phone, password })` on the client.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit({
      key: `signup:ip:${ip}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "عدد الطلبات كبير. حاول لاحقاً." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      signupToken?: string;
      fullName?: string;
      password?: string;
      email?: string | null;
      nationality?: string | null;
      preferredLang?: string;
    };

    const token = body.signupToken ?? "";
    const decoded = verifySignupToken(token, "signup");
    if (!decoded) {
      return NextResponse.json(
        { error: "رمز التسجيل غير صالح أو منتهي. أعد التحقّق من رقمك." },
        { status: 400 },
      );
    }

    const phone = normalizePhone(decoded.phone);
    const fullName = (body.fullName ?? "").trim();
    const password = body.password ?? "";
    if (!phone || !fullName || password.length < 6) {
      return NextResponse.json(
        { error: "تحقّق من الاسم وكلمة المرور (6 أحرف على الأقل)" },
        { status: 400 },
      );
    }
    const email = (body.email ?? "").trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "البريد الإلكتروني غير صالح" },
        { status: 400 },
      );
    }

    const existing = await prisma.guestAccount.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
      select: { id: true, phone: true, email: true },
    });
    if (existing) {
      const conflictField =
        existing.phone === phone ? "رقم الهاتف" : "البريد الإلكتروني";
      return NextResponse.json(
        {
          error: `يوجد حساب مسجّل بنفس ${conflictField}. سجّل الدخول أو استخدم "نسيت كلمة المرور".`,
        },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const preferredLang =
      body.preferredLang === "en" ? "en" : "ar";

    const guest = await prisma.guestAccount.create({
      data: {
        phone,
        phoneVerifiedAt: new Date(),
        email,
        passwordHash,
        fullName,
        nationality: body.nationality?.trim() || null,
        preferredLang,
      },
      select: { id: true, phone: true, fullName: true },
    });

    return NextResponse.json({
      ok: true,
      guestId: guest.id,
      phone: guest.phone,
    });
  } catch (error) {
    console.error("POST /api/guest-auth/signup error:", error);
    return NextResponse.json(
      { error: "تعذّر إنشاء الحساب. حاول لاحقاً." },
      { status: 500 },
    );
  }
}
