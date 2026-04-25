import { NextAuthOptions, type CookiesOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { normalizePhone } from "./phone";
import guestJwt from "./guest-auth/jwt";
import { findOrCreateGuestFromSocial, type SocialProvider } from "./guest-auth/social";

/**
 * Cross-subdomain session support.
 *
 * In production the app is served on two hostnames:
 *   • `admin.mafhotel.com` (staff UI)
 *   • `mafhotel.com`        (guest/public UI)
 *
 * Setting `SESSION_COOKIE_DOMAIN=.mafhotel.com` makes the NextAuth session
 * cookie valid on both, so logging in on one host carries over to the other
 * (and our middleware can trust the same JWT regardless of which subdomain
 * the request lands on).
 *
 * Leave it unset in dev — cookies scope to `localhost` by default.
 */
function buildAuthCookies(): Partial<CookiesOptions> | undefined {
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  if (!domain) return undefined;

  const useSecurePrefix = process.env.NODE_ENV === "production";
  const sessionCookieName = useSecurePrefix
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
  const callbackCookieName = useSecurePrefix
    ? "__Secure-next-auth.callback-url"
    : "next-auth.callback-url";
  const csrfCookieName = useSecurePrefix
    ? "__Host-next-auth.csrf-token"
    : "next-auth.csrf-token";

  return {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecurePrefix,
        domain,
      },
    },
    callbackUrl: {
      name: callbackCookieName,
      options: {
        sameSite: "lax",
        path: "/",
        secure: useSecurePrefix,
        domain,
      },
    },
    // `__Host-` prefix MUST NOT set a Domain attribute, so fall back to a
    // plain-name cookie that can be shared across subdomains.
    csrfToken: {
      name: useSecurePrefix ? "next-auth.csrf-token" : csrfCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecurePrefix,
        domain,
      },
    },
  };
}

function isGoogleEnabled(): boolean {
  return Boolean(
    (process.env.GOOGLE_CLIENT_ID ?? "").trim() &&
      (process.env.GOOGLE_CLIENT_SECRET ?? "").trim(),
  );
}

function isAppleEnabled(): boolean {
  return Boolean(
    (process.env.APPLE_CLIENT_ID ?? "").trim() &&
      (process.env.APPLE_CLIENT_SECRET ?? "").trim(),
  );
}

function buildProviders(): Provider[] {
  const providers: Provider[] = [
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        identifier: { label: "البريد أو اسم المستخدم", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        const identifier = (credentials?.identifier || "").trim();
        if (!identifier || !credentials?.password) return null;

        const isEmail = identifier.includes("@");
        const user = await prisma.user.findFirst({
          where: isEmail
            ? { email: { equals: identifier, mode: "insensitive" } }
            : { username: { equals: identifier, mode: "insensitive" } },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );
        if (!isValid) return null;

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl ?? null,
          audience: "staff" as const,
        };
      },
    }),
    CredentialsProvider({
      id: "guest-credentials",
      name: "guest-credentials",
      credentials: {
        phone: { label: "رقم الهاتف", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
        /**
         * Optional — when provided, we treat this as proof of recent OTP
         * verification (signed by us in `/api/guest-auth/otp/verify`) and
         * skip the password check. Used for passwordless OTP login and
         * the silent sign-in that follows a fresh signup.
         */
        otpToken: { label: "OTP Token", type: "text" },
      },
      async authorize(credentials) {
        const raw = (credentials?.phone || "").trim();
        if (!raw) return null;
        const phone = normalizePhone(raw);
        if (!phone) return null;

        const otpToken = (credentials?.otpToken || "").trim();
        const password = credentials?.password || "";

        // Path A: OTP-token login. The token must be non-expired and must
        // have been issued for this exact phone + purpose ∈ {login, signup}.
        if (otpToken) {
          const decoded = guestJwt.verifySignupToken(otpToken);
          if (!decoded) return null;
          if (decoded.phone !== phone) return null;
          if (decoded.kind !== "login" && decoded.kind !== "signup") return null;
        } else if (!password) {
          return null;
        }

        const guest = await prisma.guestAccount.findUnique({
          where: { phone },
        });
        if (!guest || guest.disabledAt) return null;

        // Path B: password login. Legacy accounts still use this; new ones
        // (created after April 2026) have no password and must use OTP.
        if (!otpToken) {
          if (!guest.passwordHash) return null;
          const ok = await bcrypt.compare(password, guest.passwordHash);
          if (!ok) return null;
        }

        await prisma.guestAccount.update({
          where: { id: guest.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: String(guest.id),
          name: guest.fullName,
          email: guest.email ?? `${guest.phone}@guest.local`,
          avatarUrl: guest.avatarUrl ?? null,
          audience: "guest" as const,
          phone: guest.phone ?? null,
        };
      },
    }),
  ];

  if (isGoogleEnabled()) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        // Cache the user-presented chooser between sign-ins so returning
        // guests don't have to re-pick their account every time.
        authorization: { params: { prompt: "select_account" } },
      }),
    );
  }
  if (isAppleEnabled()) {
    providers.push(
      AppleProvider({
        clientId: process.env.APPLE_CLIENT_ID!,
        clientSecret: process.env.APPLE_CLIENT_SECRET!,
      }),
    );
  }

  return providers;
}

/**
 * NextAuth configuration — Credentials providers for staff and guests, plus
 * optional Google / Apple OAuth providers for the guest funnel (enabled
 * only when their env vars are set).
 *
 *   • "credentials"         → hotel staff (User table, role-based RBAC)
 *   • "guest-credentials"   → end-users that book online (GuestAccount table)
 *   • "google" / "apple"    → social sign-in for guests; the OAuth profile
 *     is mapped to a GuestAccount in the `jwt` callback below, with
 *     `phone === null` until the user completes phone verification at
 *     /account/complete-profile.
 *
 * Both issue JWT sessions; the distinction lives in the `audience` claim
 * consumed by `src/middleware.ts` and any server-side permission guards.
 */
export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      // ─── First call after a successful sign-in ────────────────────────
      // For OAuth providers (google/apple) NextAuth gives us `account` and
      // `profile` once. We use them to upsert the GuestAccount + identity
      // and overwrite the token claims with our own canonical values.
      if (account && (account.provider === "google" || account.provider === "apple")) {
        const provider = account.provider as SocialProvider;
        const providerId =
          (account.providerAccountId as string | undefined) ??
          (typeof profile === "object" && profile && "sub" in profile
            ? String((profile as { sub?: unknown }).sub ?? "")
            : "");
        if (!providerId) {
          // Without a stable subject we cannot key the identity. Refuse.
          throw new Error("[auth] OAuth profile missing `sub` — refusing sign-in.");
        }

        const profileObj = (profile ?? {}) as {
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
          given_name?: string;
          family_name?: string;
        };
        const resolved = await findOrCreateGuestFromSocial({
          provider,
          providerId,
          email: profileObj.email ?? user?.email ?? null,
          emailVerified: Boolean(profileObj.email_verified),
          name:
            profileObj.name ??
            user?.name ??
            ([profileObj.given_name, profileObj.family_name]
              .filter(Boolean)
              .join(" ") ||
              null),
          avatarUrl: profileObj.picture ?? null,
        });

        token.id = String(resolved.guestAccountId);
        token.audience = "guest";
        token.role = undefined;
        token.name = resolved.fullName;
        token.email =
          resolved.email ??
          (resolved.phone ? `${resolved.phone}@guest.local` : null);
        token.phone = resolved.phoneVerifiedAt ? resolved.phone : null;
        token.avatarUrl = resolved.avatarUrl ?? null;
        return token;
      }

      // ─── Credentials flow (staff or guest-credentials) ─────────────────
      if (user) {
        const u = user as typeof user & {
          audience?: "staff" | "guest";
          role?: string;
          avatarUrl?: string | null;
          phone?: string | null;
        };
        token.id = u.id;
        token.audience = u.audience ?? "staff";
        token.role = u.role;
        token.avatarUrl = u.avatarUrl ?? null;
        token.phone = u.phone ?? null;
      }

      // Refresh latest profile data whenever the client calls `session.update()`.
      if (trigger === "update" && token.id) {
        const numericId = Number(token.id);
        if (Number.isFinite(numericId)) {
          if (token.audience === "guest") {
            const fresh = await prisma.guestAccount.findUnique({
              where: { id: numericId },
              select: {
                fullName: true,
                email: true,
                phone: true,
                phoneVerifiedAt: true,
                avatarUrl: true,
              },
            });
            if (fresh) {
              token.name = fresh.fullName;
              token.email =
                fresh.email ??
                (fresh.phone ? `${fresh.phone}@guest.local` : null);
              token.avatarUrl = fresh.avatarUrl ?? null;
              token.phone = fresh.phoneVerifiedAt ? fresh.phone : null;
            }
          } else {
            const fresh = await prisma.user.findUnique({
              where: { id: numericId },
              select: { name: true, email: true, avatarUrl: true, role: true },
            });
            if (fresh) {
              token.name = fresh.name;
              token.email = fresh.email;
              token.avatarUrl = fresh.avatarUrl ?? null;
              token.role = fresh.role;
            }
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.audience =
          (token.audience as "staff" | "guest") ?? "staff";
        session.user.role = (token.role as string | undefined) ?? undefined;
        session.user.avatarUrl =
          (token.avatarUrl as string | null | undefined) ?? null;
        session.user.phone =
          (token.phone as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  cookies: buildAuthCookies(),
};

