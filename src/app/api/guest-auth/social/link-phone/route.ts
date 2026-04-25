import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import guestJwt from "@/lib/guest-auth/jwt";
import { linkPhoneToGuest } from "@/lib/guest-auth/social";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * POST /api/guest-auth/social/link-phone
 * Body: { phone, signupToken }
 *
 * Called from `/account/complete-profile` after a fresh Google/Apple
 * sign-up. The signupToken is the same short-lived JWT the OTP-verify
 * endpoint already issues (kind = "signup" or "change_phone"), so we
 * reuse the existing verification path — the user has just proven phone
 * ownership via WhatsApp OTP at most 10 minutes ago.
 *
 * On success we update the guest's phone + phoneVerifiedAt and add a
 * "phone" identity row so future OTP logins from that number map back to
 * the same logical guest. The client must then call `session.update()`
 * (the `useSession.update` hook) to refresh the JWT — we don't have a
 * way to mutate the session from the server in NextAuth v4.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = rateLimit({
      key: `social:link:ip:${ip}`,
      limit: 10,
      windowMs: 60 * 60_000,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { error: "عدد الطلبات كبير. حاول لاحقاً." },
        { status: 429 },
      );
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.audience !== "guest") {
      return NextResponse.json(
        { error: "يجب تسجيل الدخول كضيف أولاً." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
      signupToken?: string;
    };

    const phone = normalizePhone(body.phone ?? "");
    const token = (body.signupToken ?? "").trim();
    if (!phone || !token) {
      return NextResponse.json(
        { error: "بيانات الطلب غير مكتملة." },
        { status: 400 },
      );
    }

    const decoded = guestJwt.verifySignupToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: "انتهت صلاحية رمز التحقّق. أعد طلب رمز جديد." },
        { status: 400 },
      );
    }
    if (decoded.phone !== phone) {
      return NextResponse.json(
        { error: "الرمز لا يخصّ هذا الرقم." },
        { status: 400 },
      );
    }
    // change_phone is the only kind that means "I already have an account
    // and want to attach a phone to it". Signup-kind tokens are also
    // accepted because the social signup landed at this endpoint (no
    // dedicated change_phone OTP flow yet).
    if (!["signup", "change_phone", "login"].includes(decoded.kind)) {
      return NextResponse.json(
        { error: "نوع الرمز غير مدعوم لربط الرقم." },
        { status: 400 },
      );
    }

    const guestAccountId = Number(session.user.id);
    if (!Number.isFinite(guestAccountId)) {
      return NextResponse.json(
        { error: "جلسة غير صالحة." },
        { status: 400 },
      );
    }

    const result = await linkPhoneToGuest({ guestAccountId, phone });
    if (!result.ok) {
      if (result.reason === "phone_taken") {
        return NextResponse.json(
          {
            error:
              "هذا الرقم مرتبط بحساب آخر. سجّل الدخول إليه مباشرة برقم الهاتف، أو تواصل مع الدعم لدمج الحسابات.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "تعذّر ربط الرقم." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, phone });
  } catch (error) {
    console.error("POST /api/guest-auth/social/link-phone error:", error);
    return NextResponse.json(
      { error: "تعذّر ربط الرقم. حاول لاحقاً." },
      { status: 500 },
    );
  }
}
