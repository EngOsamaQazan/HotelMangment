import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { normalizePhone } from "./phone";
import guestJwt from "./guest-auth/jwt";

/**
 * NextAuth configuration — two Credentials providers:
 *
 *   • "credentials"         → hotel staff (User table, role-based RBAC)
 *   • "guest-credentials"   → end-users that book online (GuestAccount table)
 *
 * Both issue JWT sessions; the distinction lives in the `audience` claim
 * consumed by `src/middleware.ts` and any server-side permission guards.
 */
export const authOptions: NextAuthOptions = {
  providers: [
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
          user.passwordHash
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

        // Path B: password login.
        if (!otpToken) {
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
          phone: guest.phone,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
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
              select: { fullName: true, email: true, phone: true, avatarUrl: true },
            });
            if (fresh) {
              token.name = fresh.fullName;
              token.email = fresh.email ?? `${fresh.phone}@guest.local`;
              token.avatarUrl = fresh.avatarUrl ?? null;
              token.phone = fresh.phone;
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
};

