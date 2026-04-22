import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { verifySignupToken } from "@/lib/guest-auth/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/guest-auth/reset-password
 * Body: { signupToken, password }
 *
 * The token was issued with `kind: "reset"` by /otp/verify after the user
 * proved ownership of the phone via OTP. It is single-use in practice
 * because the OTP itself was consumed during verification.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit({
      key: `reset:ip:${ip}`,
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
      password?: string;
    };
    const decoded = verifySignupToken(body.signupToken ?? "", "reset");
    if (!decoded) {
      return NextResponse.json(
        { error: "رمز إعادة التعيين غير صالح أو منتهي. أعد إرسال رمز التحقّق." },
        { status: 400 },
      );
    }
    const phone = normalizePhone(decoded.phone);
    const password = body.password ?? "";
    if (!phone || password.length < 6) {
      return NextResponse.json(
        { error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" },
        { status: 400 },
      );
    }

    const account = await prisma.guestAccount.findUnique({
      where: { phone },
      select: { id: true, disabledAt: true },
    });
    if (!account || account.disabledAt) {
      return NextResponse.json(
        { error: "لا يوجد حساب مرتبط بهذا الرقم" },
        { status: 404 },
      );
    }

    await prisma.guestAccount.update({
      where: { id: account.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });

    return NextResponse.json({ ok: true, phone });
  } catch (error) {
    console.error("POST /api/guest-auth/reset-password error:", error);
    return NextResponse.json(
      { error: "تعذّر إعادة تعيين كلمة المرور" },
      { status: 500 },
    );
  }
}
