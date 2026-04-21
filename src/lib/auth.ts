import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
        token.avatarUrl =
          (user as { avatarUrl?: string | null }).avatarUrl ?? null;
      }
      // Refresh latest name / avatar from DB whenever the client calls
      // `session.update()` (e.g. after editing the profile).
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: Number(token.id) },
          select: { name: true, email: true, avatarUrl: true },
        });
        if (fresh) {
          token.name = fresh.name;
          token.email = fresh.email;
          token.avatarUrl = fresh.avatarUrl ?? null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { avatarUrl?: string | null }).avatarUrl =
          (token.avatarUrl as string | null | undefined) ?? null;
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
