import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { signSignupToken, type OtpPurpose } from "@/lib/guest-auth/otp";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/guest-auth/otp/poll?phone=...&purpose=...
 *
 * The originating browser polls this every ~2s while the user has WhatsApp
 * open on another device. As soon as we detect that the magic link was
 * tapped (`/auth/wa/<token>` → `/api/guest-auth/wa/tap`), we return a
 * usable signup-token so the page can call `signIn("guest-credentials",
 * { phone, otpToken })` without ever asking the user to retype the code.
 *
 * Browser scoping:
 *   We require the `wa_intent` HttpOnly cookie set by /otp/start to match
 *   the `intentId` recorded on the OTP. Without that match anyone could
 *   poll for arbitrary phone numbers and steal sessions.
 */
export async function GET(request: Request) {
  try {
    const ip = clientIp(request);
    const limit = rateLimit({
      key: `otp:poll:ip:${ip}`,
      // 1 poll every ~2s × 10 minutes = up to ~300 polls. Cap generously.
      limit: 600,
      windowMs: 60 * 60_000,
    });
    if (!limit.ok) {
      return NextResponse.json(
        { error: "polling rate exceeded" },
        { status: 429 },
      );
    }

    const url = new URL(request.url);
    const phone = normalizePhone(url.searchParams.get("phone") ?? "");
    const purpose = url.searchParams.get("purpose") as OtpPurpose | null;
    if (!phone || !purpose) {
      return NextResponse.json({ status: "invalid" }, { status: 400 });
    }
    if (!["signup", "login", "reset", "change_phone"].includes(purpose)) {
      return NextResponse.json({ status: "invalid" }, { status: 400 });
    }

    // Read the browser-binding cookie. NextRequest exposes cookies via the
    // `cookies` accessor, but we're using the raw `Request` here for
    // simplicity — fall back to manual header parsing.
    const cookieHeader = request.headers.get("cookie") ?? "";
    const intentMatch = cookieHeader.match(/(?:^|;\s*)wa_intent=([^;]+)/);
    const intentId = intentMatch
      ? decodeURIComponent(intentMatch[1])
      : null;
    if (!intentId) {
      return NextResponse.json({ status: "no_intent" });
    }

    const otp = await prisma.guestOtp.findFirst({
      where: { phone, purpose, intentId },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) {
      return NextResponse.json({ status: "not_found" });
    }
    if (otp.expiresAt < new Date()) {
      return NextResponse.json({ status: "expired" });
    }
    if (otp.consumedAt) {
      return NextResponse.json({ status: "consumed" });
    }
    if (!otp.magicTappedAt) {
      return NextResponse.json({ status: "pending" });
    }

    // Tapped! Mark consumed and hand back a signup token of the appropriate
    // kind so the client can complete sign-in or signup without retyping.
    await prisma.guestOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    const signupToken = signSignupToken(phone, purpose);
    return NextResponse.json({ status: "tapped", signupToken });
  } catch (error) {
    console.error("GET /api/guest-auth/otp/poll error:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
