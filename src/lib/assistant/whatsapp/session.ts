import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AssistantWaSession } from "@prisma/client";

/**
 * Self-contained OTP + session state manager for the WhatsApp staff bot.
 *
 * Why we don't reuse `src/lib/guest-auth/otp.ts`:
 *   • Guest OTP rows live in `guest_otps` and are scoped to guest auth flows
 *     (signup/login/reset) — coupling staff sessions to the same table
 *     would conflate two different security domains and force every change
 *     in either flow to consider both.
 *   • Staff OTP TTL is much shorter (60s vs 10min) and the storage column
 *     lives directly on `AssistantWaSession` so revoking the session
 *     wipes the OTP atomically.
 *
 * State machine (mirrors the plan):
 *   pending_otp → active   (OTP verified)
 *   pending_otp → locked   (>= 5 failed attempts)
 *   active      → expired  (idle > sessionMinutes OR age > maxSessionHours)
 *   active      → revoked  (admin or self via "خروج")
 *
 * `findActiveSession()` is the single read path the rest of the assistant
 * uses — it auto-expires stale rows on read so the handler doesn't need to
 * sweep manually.
 */

const OTP_LENGTH = 6;
const OTP_TTL_MS = 60_000; // 60 seconds — staff are actively typing.
const OTP_MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60_000; // 15 minutes

export const SESSION_LOG_PREFIX = "[assistant/wa/session]";

export interface OtpDeliveryDetail {
  code: string;
  expiresAt: Date;
}

export function generateOtpCode(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, "0");
}

/**
 * Issue a new OTP for a (userId, phone) pair. Invalidates any pending OTP
 * the same user has. Caller is responsible for actually delivering the code
 * via WhatsApp — we return the plaintext so the sender can format the
 * message however it likes.
 */
export async function issueOtp(args: {
  userId: number;
  phone: string;
  sessionMinutes: number;
  maxSessionHours: number;
}): Promise<OtpDeliveryDetail> {
  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const sessionExpiresAt = new Date(now.getTime() + args.maxSessionHours * 60 * 60_000);

  // Mark every prior pending_otp row for this user/phone as revoked so the
  // newest code is the only one that can succeed.
  await prisma.assistantWaSession.updateMany({
    where: { userId: args.userId, phone: args.phone, status: { in: ["pending_otp"] } },
    data: { status: "revoked", revokedAt: now, revokedReason: "superseded" },
  });

  await prisma.assistantWaSession.create({
    data: {
      userId: args.userId,
      phone: args.phone,
      status: "pending_otp",
      otpCodeHash: codeHash,
      otpExpiresAt,
      sessionExpiresAt,
    },
  });

  return { code, expiresAt: otpExpiresAt };
}

export type VerifyResult =
  | { ok: true; session: AssistantWaSession }
  | { ok: false; reason: "no_pending" | "expired" | "mismatch" | "locked" | "too_many" };

/**
 * Validate a candidate code against the latest pending session for this
 * phone. On success the row flips to "active" and `lastActivityAt` is bumped.
 */
export async function verifyOtp(args: {
  phone: string;
  code: string;
}): Promise<VerifyResult> {
  const now = new Date();

  // Honour the lockout: if the last attempt for this phone left a "locked"
  // row whose lock window hasn't lapsed, refuse.
  const locked = await prisma.assistantWaSession.findFirst({
    where: {
      phone: args.phone,
      status: "locked",
      updatedAt: { gt: new Date(now.getTime() - LOCK_DURATION_MS) },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (locked) return { ok: false, reason: "locked" };

  const row = await prisma.assistantWaSession.findFirst({
    where: { phone: args.phone, status: "pending_otp" },
    orderBy: { createdAt: "desc" },
  });
  if (!row || !row.otpCodeHash || !row.otpExpiresAt) {
    return { ok: false, reason: "no_pending" };
  }
  if (row.otpExpiresAt < now) {
    return { ok: false, reason: "expired" };
  }
  if (row.otpAttempts >= OTP_MAX_ATTEMPTS) {
    await prisma.assistantWaSession.update({
      where: { id: row.id },
      data: { status: "locked" },
    });
    return { ok: false, reason: "too_many" };
  }

  const match = await bcrypt.compare(args.code, row.otpCodeHash);
  if (!match) {
    const updated = await prisma.assistantWaSession.update({
      where: { id: row.id },
      data: { otpAttempts: { increment: 1 } },
    });
    if (updated.otpAttempts >= OTP_MAX_ATTEMPTS) {
      await prisma.assistantWaSession.update({
        where: { id: row.id },
        data: { status: "locked" },
      });
      return { ok: false, reason: "too_many" };
    }
    return { ok: false, reason: "mismatch" };
  }

  const session = await prisma.assistantWaSession.update({
    where: { id: row.id },
    data: {
      status: "active",
      otpCodeHash: null,
      otpExpiresAt: null,
      lastActivityAt: now,
    },
  });
  return { ok: true, session };
}

/**
 * Resolve the "current" active session for an inbound phone, applying idle
 * + absolute timeouts on read. Returns null when there is no live session.
 *
 * `sessionMinutes` is the idle timeout; we re-check on every inbound rather
 * than relying on a cron sweep.
 */
export async function findActiveSession(args: {
  phone: string;
  sessionMinutes: number;
}): Promise<AssistantWaSession | null> {
  const now = new Date();
  const idleCutoff = new Date(now.getTime() - args.sessionMinutes * 60_000);

  const session = await prisma.assistantWaSession.findFirst({
    where: { phone: args.phone, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!session) return null;

  if (session.sessionExpiresAt < now) {
    await prisma.assistantWaSession.update({
      where: { id: session.id },
      data: { status: "expired" },
    });
    return null;
  }
  if (session.lastActivityAt < idleCutoff) {
    await prisma.assistantWaSession.update({
      where: { id: session.id },
      data: { status: "expired" },
    });
    return null;
  }
  return session;
}

export async function bumpActivity(sessionId: number): Promise<void> {
  await prisma.assistantWaSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });
}

export async function revokeSession(args: {
  sessionId: number;
  reason: string;
}): Promise<void> {
  await prisma.assistantWaSession.update({
    where: { id: args.sessionId },
    data: {
      status: "revoked",
      revokedAt: new Date(),
      revokedReason: args.reason,
      otpCodeHash: null,
      otpExpiresAt: null,
    },
  });
}

/** Look up a staff user by their registered WhatsApp number. */
export async function findStaffByPhone(phone: string): Promise<{
  id: number;
  name: string;
  email: string;
} | null> {
  return prisma.user.findFirst({
    where: { whatsappPhone: phone },
    select: { id: true, name: true, email: true },
  });
}
