import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Social-identity helpers — keep the duplicate-account problem out of the
 * NextAuth `jwt` callback by centralising the upsert logic here.
 *
 * Provider semantics:
 *   • "phone"  → providerId = E.164 digits (matches `GuestAccount.phone`)
 *   • "google" → providerId = Google `sub` claim (stable, opaque)
 *   • "apple"  → providerId = Apple `sub` claim (stable, opaque)
 *
 * Apple-specific gotchas handled inside `findOrCreateGuestFromSocial`:
 *   • Apple often returns a `privaterelay.appleid.com` alias instead of the
 *     real email. We store it as-is but never use it for de-duplication.
 *   • Apple only returns `name` on the very first sign-in. After that the
 *     name claim is empty — we fall back to "ضيف" if we can't find one.
 */

export type SocialProvider = "google" | "apple";

export interface SocialProfileInput {
  provider: SocialProvider;
  providerId: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface ResolvedGuestIdentity {
  guestAccountId: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  avatarUrl: string | null;
  isNewAccount: boolean;
}

/**
 * Find an existing GuestAccount linked to (provider, providerId), or create
 * a phone-less account on the fly. The returned object always reflects the
 * persisted state — including `phone: null` for fresh social signups, which
 * is the signal the UI uses to redirect to /account/complete-profile.
 */
export async function findOrCreateGuestFromSocial(
  input: SocialProfileInput,
): Promise<ResolvedGuestIdentity> {
  const provider = input.provider;
  const providerId = String(input.providerId).trim();
  if (!providerId) {
    throw new Error("[social] providerId مفقود — لا يمكن إنشاء الحساب.");
  }

  const email = (input.email ?? "").trim().toLowerCase() || null;
  const emailVerified = Boolean(input.emailVerified);
  const name = (input.name ?? "").trim() || "ضيف";
  const avatarUrl = (input.avatarUrl ?? "").trim() || null;

  // 1) Existing identity → reuse the linked guest as-is.
  const existing = await prisma.guestAccountIdentity.findUnique({
    where: {
      provider_providerId: { provider, providerId },
    },
    include: { guestAccount: true },
  });

  if (existing && existing.guestAccount && !existing.guestAccount.disabledAt) {
    // Touch lastUsedAt asynchronously — don't block sign-in on it.
    void prisma.guestAccountIdentity.update({
      where: { id: existing.id },
      data: { lastUsedAt: new Date() },
    });
    void prisma.guestAccount.update({
      where: { id: existing.guestAccount.id },
      data: { lastLoginAt: new Date() },
    });
    return {
      guestAccountId: existing.guestAccount.id,
      fullName: existing.guestAccount.fullName,
      email: existing.guestAccount.email,
      phone: existing.guestAccount.phone,
      phoneVerifiedAt: existing.guestAccount.phoneVerifiedAt,
      avatarUrl: existing.guestAccount.avatarUrl,
      isNewAccount: false,
    };
  }

  // 2) No identity yet — try to attach to an existing guest by verified email.
  //    Apple's `privaterelay.appleid.com` aliases also forward to a real
  //    account, but they aren't a stable identifier so we ignore them for
  //    matching purposes (only verified, non-relay emails count).
  let attachToGuestId: number | null = null;
  const isAppleRelay =
    provider === "apple" &&
    email !== null &&
    email.endsWith("@privaterelay.appleid.com");

  if (email && emailVerified && !isAppleRelay) {
    const byEmail = await prisma.guestAccount.findUnique({
      where: { email },
      select: { id: true, disabledAt: true },
    });
    if (byEmail && !byEmail.disabledAt) attachToGuestId = byEmail.id;
  }

  // 3) Create a guest if we couldn't attach to an existing one.
  let guestAccountId: number;
  let isNewAccount = false;
  if (attachToGuestId !== null) {
    guestAccountId = attachToGuestId;
  } else {
    const created = await prisma.guestAccount.create({
      data: {
        // phone stays null until the user verifies one via /account/complete-profile
        phone: null,
        email,
        emailVerifiedAt: email && emailVerified && !isAppleRelay ? new Date() : null,
        fullName: name,
        avatarUrl,
        passwordHash: null,
      },
      select: { id: true },
    });
    guestAccountId = created.id;
    isNewAccount = true;
  }

  // 4) Always create the identity row last, so we never end up with an
  //    orphaned guest if the identity insert fails.
  await prisma.guestAccountIdentity.create({
    data: {
      guestAccountId,
      provider,
      providerId,
      email,
      emailVerified,
    },
  });

  const guest = await prisma.guestAccount.findUnique({
    where: { id: guestAccountId },
  });
  if (!guest) {
    throw new Error("[social] guest just created but not found — race?");
  }

  void prisma.guestAccount.update({
    where: { id: guest.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    guestAccountId: guest.id,
    fullName: guest.fullName,
    email: guest.email,
    phone: guest.phone,
    phoneVerifiedAt: guest.phoneVerifiedAt,
    avatarUrl: guest.avatarUrl,
    isNewAccount,
  };
}

/**
 * Link a verified phone number to an existing (typically social-only) guest
 * account. Called from `/api/guest-auth/social/link-phone` after the user
 * confirms ownership via WhatsApp OTP.
 *
 * Returns:
 *   • { ok: true } on success
 *   • { ok: false, reason: "phone_taken" } if the phone is already attached
 *     to a different guest — the UI should offer to merge or sign in to
 *     that account instead.
 */
export async function linkPhoneToGuest(args: {
  guestAccountId: number;
  phone: string;
}): Promise<{ ok: true } | { ok: false; reason: "phone_taken" }> {
  // Defensive: no other guest may already own this phone.
  const conflict = await prisma.guestAccount.findUnique({
    where: { phone: args.phone },
    select: { id: true },
  });
  if (conflict && conflict.id !== args.guestAccountId) {
    return { ok: false, reason: "phone_taken" };
  }

  await prisma.$transaction([
    prisma.guestAccount.update({
      where: { id: args.guestAccountId },
      data: {
        phone: args.phone,
        phoneVerifiedAt: new Date(),
      },
    }),
    prisma.guestAccountIdentity.upsert({
      where: {
        provider_providerId: { provider: "phone", providerId: args.phone },
      },
      create: {
        guestAccountId: args.guestAccountId,
        provider: "phone",
        providerId: args.phone,
        emailVerified: false,
      },
      update: {
        guestAccountId: args.guestAccountId,
        lastUsedAt: new Date(),
      },
    }),
  ]);

  return { ok: true };
}
