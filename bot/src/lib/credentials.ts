import crypto from "node:crypto";
import { prisma } from "./prisma";

/**
 * Mirrors src/lib/booking/encryption.ts on the web side. Must use the same
 * BOOKING_ENC_KEY (or fallback to NEXTAUTH_SECRET in dev).
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
  return crypto.createHash("sha256").update(fallback).digest();
}

function decrypt(packed: string): string {
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

export interface DecryptedCredential {
  id: number;
  label: string;
  email: string;
  password: string;
  twoFaSecret: string | null;
  propertyId: string | null;
}

export async function loadCredential(id: number): Promise<DecryptedCredential> {
  const row = await prisma.bookingCredential.findUnique({ where: { id } });
  if (!row) throw new Error(`BookingCredential ${id} not found`);
  if (!row.isActive) throw new Error(`BookingCredential ${id} is disabled`);

  return {
    id: row.id,
    label: row.label,
    email: row.email,
    password: decrypt(row.passwordEnc),
    twoFaSecret: row.twoFaSecretEnc ? decrypt(row.twoFaSecretEnc) : null,
    propertyId: row.propertyId,
  };
}

export async function markLoginResult(id: number, ok: boolean) {
  await prisma.bookingCredential.update({
    where: { id },
    data: { lastLoginAt: new Date(), lastLoginOk: ok },
  });
}
