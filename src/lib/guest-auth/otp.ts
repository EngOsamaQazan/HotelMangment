import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "./jwt";
import { prisma } from "@/lib/prisma";
import { sendTemplate, sendText, isWhatsAppApiError } from "@/lib/whatsapp/client";

export type OtpPurpose = "signup" | "login" | "reset" | "change_phone";

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

/** Cryptographically-random 6-digit code as a string, e.g. "048213". */
export function generateOtpCode(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, "0");
}

export async function createOtp(args: {
  phone: string;
  purpose: OtpPurpose;
  ip: string | null;
}): Promise<{
  id: number;
  code: string;
  expiresAt: Date;
  intentId: string;
  /** HMAC-signed token embedded in the WhatsApp magic link. */
  magicToken: string;
}> {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const intentId = crypto.randomUUID();

  // Invalidate any previous un-consumed OTPs for the same (phone, purpose).
  await prisma.guestOtp.updateMany({
    where: { phone: args.phone, purpose: args.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const row = await prisma.guestOtp.create({
    data: {
      phone: args.phone,
      codeHash,
      purpose: args.purpose,
      expiresAt,
      ip: args.ip ?? null,
      intentId,
    },
  });

  // Magic-link token. Signed with the existing HMAC secret so the landing
  // page can validate it without a DB hit before calling /wa/tap.
  const magicToken = jwt.signSignupToken(args.phone, mapPurposeToTokenKind(args.purpose));

  return { id: row.id, code, expiresAt, intentId, magicToken };
}

function mapPurposeToTokenKind(p: OtpPurpose): "signup" | "login" | "reset" | "change_phone" {
  return p;
}

export interface VerifyOtpResult {
  ok: boolean;
  reason?: "not_found" | "expired" | "consumed" | "mismatch" | "too_many";
  otpId?: number;
}

export async function verifyOtp(args: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<VerifyOtpResult> {
  const now = new Date();
  const row = await prisma.guestOtp.findFirst({
    where: {
      phone: args.phone,
      purpose: args.purpose,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt < now) return { ok: false, reason: "expired" };
  if (row.attempts >= OTP_MAX_ATTEMPTS)
    return { ok: false, reason: "too_many" };

  const match = await bcrypt.compare(args.code, row.codeHash);
  if (!match) {
    await prisma.guestOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "mismatch" };
  }

  await prisma.guestOtp.update({
    where: { id: row.id },
    data: { consumedAt: now },
  });
  return { ok: true, otpId: row.id };
}

/**
 * Resolve the public origin used in WhatsApp magic links. Prefers the public
 * site URL (mafhotel.com) over the admin host or NEXTAUTH_URL because the
 * magic link is delivered to *guests*. Falls back to localhost in dev.
 */
function getMagicLinkOrigin(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXTAUTH_URL,
    "http://localhost:3000",
  ];
  for (const c of candidates) {
    const v = (c ?? "").trim().replace(/\/+$/, "");
    if (v) return v;
  }
  return "http://localhost:3000";
}

/** Build the WhatsApp click-to-login URL embedded in the OTP message. */
export function buildMagicLink(magicToken: string): string {
  return `${getMagicLinkOrigin()}/auth/wa/${encodeURIComponent(magicToken)}`;
}

/**
 * Send the OTP message via WhatsApp. We always include both:
 *   • the 6-digit code (so the user can type it back), and
 *   • a magic link (so the user can tap once to verify automatically).
 *
 * Channel selection:
 *   • If `WHATSAPP_OTP_TEMPLATE` is configured, we send the AUTHENTICATION
 *     template (most reliable for cold conversations) AND immediately follow
 *     up with a plain-text message containing the magic link. The template
 *     is enough to satisfy Meta's 24-hour-window rule, and the follow-up
 *     piggybacks on the now-open conversation window.
 *   • Otherwise we send a single combined text message. This only works if
 *     the recipient is already inside the customer-service window.
 *
 * Returns `{ sent: true }` on success. Returns `{ sent: false, reason }`
 * on WhatsApp API failure — callers should surface a generic "couldn't
 * send verification code" to the user without leaking details.
 */
export async function deliverOtp(args: {
  phone: string;
  code: string;
  purpose: OtpPurpose;
  magicToken: string;
}): Promise<
  | { sent: true; channel: "template" | "text"; magicLink: string }
  | { sent: false; reason: string; magicLink: string }
> {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE;
  const magicLink = buildMagicLink(args.magicToken);

  try {
    if (templateName) {
      await sendTemplate({
        to: args.phone,
        templateName,
        language: "ar",
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: args.code }],
          },
          // Most AUTHENTICATION templates Meta approves require a button
          // parameter that passes the code back as the copy-code payload.
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: args.code }],
          },
        ],
      });

      // Best-effort follow-up with the magic link inside the now-open
      // 24-hour window. Failure here doesn't fail the whole delivery —
      // the user can still type the 6-digit code from the template.
      try {
        await sendText({
          to: args.phone,
          text:
            `أو اضغط هنا للتحقق التلقائي بدون نسخ الرمز:\n${magicLink}\n\n(الرابط صالح لمدة 10 دقائق ولاستخدام مرة واحدة فقط — لا تشاركه مع أيّ شخص.)`,
        });
      } catch (followUpErr) {
        console.warn("[guest-auth] magic-link follow-up failed:", followUpErr);
      }

      return { sent: true, channel: "template", magicLink };
    }

    await sendText({
      to: args.phone,
      text:
        `رمز التحقّق الخاص بك في فندق المفرق هو: ${args.code}\n` +
        `أو اضغط هنا للتحقق التلقائي:\n${magicLink}\n\n` +
        `صالح لمدة 10 دقائق. لا تشارك هذا الرمز أو الرابط مع أيّ شخص.`,
    });
    return { sent: true, channel: "text", magicLink };
  } catch (error) {
    const reason = isWhatsAppApiError(error)
      ? `whatsapp:${error.code ?? error.status}`
      : String((error as Error).message ?? error);
    return { sent: false, reason, magicLink };
  }
}

// Short-lived JWT re-exports (keeps the call-sites tidy).
export const signSignupToken = jwt.signSignupToken;
export const verifySignupToken = jwt.verifySignupToken;
