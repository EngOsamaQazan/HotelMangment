import crypto from "node:crypto";

/**
 * AES-256-GCM symmetric encryption for secrets (Booking.com passwords / TOTP).
 *
 * Stores ciphertext as base64(iv | authTag | ciphertext) so decryption only needs
 * the master key + stored string.
 *
 * The master key is read from BOOKING_ENC_KEY (64 hex chars = 32 bytes).
 * In development, if unset, we derive a *stable* key from NEXTAUTH_SECRET so
 * local data isn't destroyed on every restart. Production MUST set BOOKING_ENC_KEY.
 */

const ALGO = "aes-256-gcm" as const;
const IV_LENGTH = 12;

function getKey(): Buffer {
  const raw = process.env.BOOKING_ENC_KEY;
  if (raw) {
    if (!/^[0-9a-f]{64}$/i.test(raw)) {
      throw new Error("BOOKING_ENC_KEY must be 64 hex chars (32 bytes)");
    }
    return Buffer.from(raw, "hex");
  }
  const fallback = process.env.NEXTAUTH_SECRET || "dev-insecure-secret";
  // In dev, derive a deterministic 32-byte key; never use this in production.
  return crypto.createHash("sha256").update(fallback).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptSecret(packed: string): string {
  if (!packed) return "";
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}
