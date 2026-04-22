import "server-only";
import crypto from "node:crypto";

/**
 * Tiny HMAC-SHA256 JWT (header.payload.signature, base64url) used for the
 * short-lived "signup token" issued by `/api/guest-auth/otp/verify` and
 * consumed by `/api/guest-auth/signup`. We don't reach for a full JWT
 * library because the surface is limited and we don't want the extra
 * dependency — the implementation is ~40 lines and deliberately boring.
 *
 * Do NOT reuse this module for long-lived session tokens; NextAuth owns
 * that responsibility.
 */

const ALG = "HS256";

function secret(): Buffer {
  const raw =
    process.env.NEXTAUTH_SECRET ||
    process.env.GUEST_AUTH_SECRET ||
    "";
  if (!raw) {
    throw new Error(
      "NEXTAUTH_SECRET (or GUEST_AUTH_SECRET) يجب ضبطه لإنشاء signup token",
    );
  }
  return Buffer.from(raw, "utf8");
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface SignupTokenPayload {
  kind: "signup" | "reset" | "change_phone" | "login";
  phone: string;
  /** Expiration (epoch seconds). */
  exp: number;
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Random nonce — 1-use guard against replay. */
  jti: string;
}

const TEN_MINUTES = 10 * 60;

function sign(payload: Record<string, unknown>): string {
  const header = { alg: ALG, typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = b64url(crypto.createHmac("sha256", secret()).update(data).digest());
  return `${data}.${sig}`;
}

function verifyAndDecode<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expected = b64url(
    crypto.createHmac("sha256", secret()).update(`${h}.${p}`).digest(),
  );
  if (
    expected.length !== s.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))
  ) {
    return null;
  }
  try {
    return JSON.parse(fromB64url(p).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function signSignupToken(
  phone: string,
  kind: SignupTokenPayload["kind"] = "signup",
): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload: SignupTokenPayload = {
    kind,
    phone,
    iat,
    exp: iat + TEN_MINUTES,
    jti: crypto.randomUUID(),
  };
  return sign(payload as unknown as Record<string, unknown>);
}

function verifySignupToken(
  token: string,
  expectedKind?: SignupTokenPayload["kind"],
): SignupTokenPayload | null {
  const decoded = verifyAndDecode<SignupTokenPayload>(token);
  if (!decoded) return null;
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) return null;
  if (expectedKind && decoded.kind !== expectedKind) return null;
  return decoded;
}

const api = { signSignupToken, verifySignupToken };
export default api;
