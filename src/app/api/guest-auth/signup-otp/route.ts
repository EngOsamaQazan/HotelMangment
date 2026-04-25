import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { verifySignupToken } from "@/lib/guest-auth/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/guest-auth/signup-otp
 * Body: { signupToken, fullName }
 *
 * Passwordless companion to `/api/guest-auth/signup`. Used by the unified
 * `<UnifiedAuthGate>` (booking funnel + /signin + /signup) which collects
 * the WhatsApp OTP first, then creates the account on the fly without
 * ever asking the user for a password.
 *
 * The token must come from `/api/guest-auth/otp/verify` (or the
 * /otp/poll click-to-login endpoint) and prove ownership of `phone`.
 *
 * If a guest with the same phone already exists this endpoint is a no-op
 * (200 OK) — the caller should simply call `signIn` again with the same
 * OTP token. This makes the API idempotent on retry.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit({
      key: `signup-otp:ip:${ip}`,
      limit: 20,
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
    };

    const token = (body.signupToken ?? "").trim();
    const decoded = verifySignupToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "رمز التحقّق غير صالح أو منتهي. أعد إرساله." },
        { status: 400 },
      );
    }
    // We accept any kind that proves phone ownership ("login", "signup",
    // "change_phone"). The OTP-verify endpoint mirrors the OTP purpose
    // into the token kind.
    if (!["login", "signup", "change_phone"].includes(decoded.kind)) {
      return NextResponse.json(
        { error: "نوع الرمز غير مدعوم." },
        { status: 400 },
      );
    }

    const phone = normalizePhone(decoded.phone);
    if (!phone) {
      return NextResponse.json(
        { error: "رقم الهاتف داخل الرمز غير صالح." },
        { status: 400 },
      );
    }

    const fullName = (body.fullName ?? "").trim() || "ضيف";
    if (fullName.length < 2) {
      return NextResponse.json(
        { error: "الاسم قصير جداً." },
        { status: 400 },
      );
    }

    const existing = await prisma.guestAccount.findUnique({
      where: { phone },
      select: { id: true, disabledAt: true },
    });
    if (existing) {
      if (existing.disabledAt) {
        return NextResponse.json(
          { error: "هذا الحساب موقوف. تواصل مع الدعم." },
          { status: 403 },
        );
      }
      // Idempotent: account already exists — the caller can sign in
      // immediately with the same OTP token.
      return NextResponse.json({ ok: true, created: false, phone });
    }

    const guest = await prisma.guestAccount.create({
      data: {
        phone,
        phoneVerifiedAt: new Date(),
        fullName,
        passwordHash: null,
        preferredLang: "ar",
      },
      select: { id: true },
    });

    // Mirror the phone in the identities table so future social logins
    // that share this phone (after the user adds a phone via Google) can
    // de-duplicate against it.
    await prisma.guestAccountIdentity.upsert({
      where: { provider_providerId: { provider: "phone", providerId: phone } },
      create: {
        guestAccountId: guest.id,
        provider: "phone",
        providerId: phone,
        emailVerified: false,
      },
      update: {
        guestAccountId: guest.id,
        lastUsedAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      created: true,
      phone,
      guestId: guest.id,
    });
  } catch (error) {
    console.error("POST /api/guest-auth/signup-otp error:", error);
    return NextResponse.json(
      { error: "تعذّر إنشاء الحساب. حاول لاحقاً." },
      { status: 500 },
    );
  }
}
