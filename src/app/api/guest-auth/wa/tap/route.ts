import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import guestJwt from "@/lib/guest-auth/jwt";
import { normalizePhone } from "@/lib/phone";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/guest-auth/wa/tap
 * Body: { token: string }
 *
 * Called by `/auth/wa/[token]/page.tsx` when the user taps the magic link
 * inside WhatsApp. We:
 *   1. Verify the token signature & TTL.
 *   2. Look up the most recent un-consumed OTP for that phone+purpose.
 *   3. Mark it as `magicTappedAt = now` so the originating browser's poll
 *      can pick it up and complete sign-in.
 *
 * The endpoint responds with `{ ok: true, sameBrowser, phone }` where
 * `sameBrowser` reports whether the tapping browser is the same one that
 * initiated the OTP (we check via the `wa_intent` cookie). The landing
 * page uses that flag to decide between auto-completing the sign-in or
 * showing a "return to your other browser" message.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const limit = rateLimit({
      key: `wa:tap:ip:${ip}`,
      limit: 30,
      windowMs: 60 * 60_000,
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد الطلبات كبير. حاول لاحقاً." },
        { status: 429 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
    };
    const token = (body.token ?? "").trim();
    if (!token) {
      return NextResponse.json(
        { error: "الرابط غير صالح." },
        { status: 400 },
      );
    }

    const decoded = guestJwt.verifySignupToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "انتهت صلاحية الرابط أو أنه غير صالح." },
        { status: 400 },
      );
    }
    const phone = normalizePhone(decoded.phone);
    const kind = decoded.kind;
    if (!phone) {
      return NextResponse.json(
        { error: "رقم الهاتف داخل الرابط غير صالح." },
        { status: 400 },
      );
    }
    if (!["signup", "login", "reset", "change_phone"].includes(kind)) {
      return NextResponse.json(
        { error: "نوع الرابط غير مدعوم." },
        { status: 400 },
      );
    }

    const otp = await prisma.guestOtp.findFirst({
      where: { phone, purpose: kind, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) {
      return NextResponse.json(
        { error: "لا يوجد طلب تحقّق نشط لهذا الرقم. ابدأ من جديد." },
        { status: 410 },
      );
    }
    if (otp.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "انتهت صلاحية الرابط. اطلب رمزاً جديداً." },
        { status: 410 },
      );
    }

    if (!otp.magicTappedAt) {
      await prisma.guestOtp.update({
        where: { id: otp.id },
        data: { magicTappedAt: new Date() },
      });
    }

    const cookieHeader = request.headers.get("cookie") ?? "";
    const intentMatch = cookieHeader.match(/(?:^|;\s*)wa_intent=([^;]+)/);
    const cookieIntent = intentMatch ? decodeURIComponent(intentMatch[1]) : null;
    const sameBrowser = Boolean(cookieIntent && otp.intentId && cookieIntent === otp.intentId);

    return NextResponse.json({
      ok: true,
      sameBrowser,
      phone,
      kind,
    });
  } catch (error) {
    console.error("POST /api/guest-auth/wa/tap error:", error);
    return NextResponse.json(
      { error: "تعذّر التحقّق من الرابط." },
      { status: 500 },
    );
  }
}
