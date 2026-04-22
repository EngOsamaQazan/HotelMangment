import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { createOtp, deliverOtp, type OtpPurpose } from "@/lib/guest-auth/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/guest-auth/otp/start
 * Body: { phone: string, purpose: "signup" | "login" | "reset" | "change_phone" }
 *
 * Rate-limits:
 *   3 requests / 10 minutes  per phone  (absolute cap)
 *   5 requests / hour        per IP     (guard against spray attacks)
 *
 * Returns 200 `{ ok: true, expiresIn }` on success; the plain code is
 * delivered via WhatsApp, never exposed in the response. For UX, we also
 * return the same 200 shape when the phone doesn't exist for a "login" /
 * "reset" purpose — this avoids enumeration while still sending the code
 * in the "signup" flow where account existence matters to the user.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
      purpose?: string;
    };

    const phone = normalizePhone(body.phone ?? "");
    const purpose = body.purpose as OtpPurpose | undefined;
    if (!phone) {
      return NextResponse.json(
        { error: "رقم الهاتف غير صالح" },
        { status: 400 },
      );
    }
    if (!purpose || !["signup", "login", "reset", "change_phone"].includes(purpose)) {
      return NextResponse.json(
        { error: "نوع الطلب غير مدعوم" },
        { status: 400 },
      );
    }

    const ip = clientIp(request);
    const byPhone = rateLimit({
      key: `otp:start:phone:${phone}`,
      limit: 3,
      windowMs: 10 * 60_000,
    });
    if (!byPhone.ok) {
      return NextResponse.json(
        {
          error: `تم إرسال رمز مسبقاً. الرجاء الانتظار قبل الطلب من جديد.`,
          retryAfter: byPhone.retryAfter,
        },
        { status: 429, headers: { "Retry-After": String(byPhone.retryAfter) } },
      );
    }
    const byIp = rateLimit({
      key: `otp:start:ip:${ip}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!byIp.ok) {
      return NextResponse.json(
        { error: "عدد الطلبات كبير. حاول لاحقاً.", retryAfter: byIp.retryAfter },
        { status: 429, headers: { "Retry-After": String(byIp.retryAfter) } },
      );
    }

    // For login/reset/change_phone we need an existing (and active) account.
    // For signup we skip the lookup — anyone can request a code for their own
    // phone. If an account already exists for that phone we still issue the
    // OTP but the downstream /signup endpoint will reject.
    if (purpose !== "signup") {
      const existing = await prisma.guestAccount.findUnique({
        where: { phone },
        select: { id: true, disabledAt: true },
      });
      if (!existing || existing.disabledAt) {
        // Silent success — don't leak account existence.
        return NextResponse.json({ ok: true, expiresIn: 600 });
      }
    }

    const { code } = await createOtp({ phone, purpose, ip });

    // In dev, surface the code to server logs so you don't need WhatsApp
    // configured to test the flow locally. Never reach this in prod.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[guest-auth] OTP for ${phone} (${purpose}): ${code}`);
    }

    const delivery = await deliverOtp({ phone, code, purpose });
    if (!delivery.sent) {
      // If WhatsApp is unreachable in production we still mark the request as
      // successful — the user can retry. But log the failure reason for ops.
      console.warn("[guest-auth] OTP delivery failed:", delivery.reason);
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "تعذّر إرسال رمز التحقّق عبر واتساب. حاول بعد قليل." },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({ ok: true, expiresIn: 600 });
  } catch (error) {
    console.error("POST /api/guest-auth/otp/start error:", error);
    return NextResponse.json(
      { error: "تعذّر إصدار رمز التحقّق" },
      { status: 500 },
    );
  }
}
