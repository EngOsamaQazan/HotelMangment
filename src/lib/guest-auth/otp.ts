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
}) {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

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
    },
  });

  return { id: row.id, code, expiresAt };
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
 * Send the OTP message via WhatsApp. Prefers an approved template if one is
 * configured via env (`WHATSAPP_OTP_TEMPLATE`), otherwise falls back to a
 * plain text message — which only works for numbers already inside the
 * 24-hour customer service window. For brand-new signups we therefore
 * STRONGLY recommend configuring the template.
 *
 * Returns `{ sent: true }` on success. Returns `{ sent: false, reason }`
 * on WhatsApp API failure — callers should surface a generic "couldn't
 * send verification code" to the user without leaking details.
 */
export async function deliverOtp(args: {
  phone: string;
  code: string;
  purpose: OtpPurpose;
}): Promise<
  | { sent: true; channel: "template" | "text" }
  | { sent: false; reason: string }
> {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE;

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
      return { sent: true, channel: "template" };
    }

    await sendText({
      to: args.phone,
      text: `رمز التحقّق الخاص بك في فندق المفرق هو: ${args.code}\nصالح لمدة 10 دقائق. لا تشارك هذا الرمز مع أيّ شخص.`,
    });
    return { sent: true, channel: "text" };
  } catch (error) {
    const reason = isWhatsAppApiError(error)
      ? `whatsapp:${error.code ?? error.status}`
      : String((error as Error).message ?? error);
    return { sent: false, reason };
  }
}

// Short-lived JWT re-exports (keeps the call-sites tidy).
export const signSignupToken = jwt.signSignupToken;
export const verifySignupToken = jwt.verifySignupToken;
