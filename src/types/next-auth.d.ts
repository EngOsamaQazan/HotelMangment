import "next-auth";

/**
 * NextAuth session supports TWO distinct audiences:
 *
 *   - audience="staff"  → the `id` is the `User.id` (hotel employees)
 *   - audience="guest"  → the `id` is the `GuestAccount.id` (end-users booking online)
 *
 * The middleware uses `audience` to keep the two experiences isolated:
 * staff paths (/reservations, /rooms, /accounting, ...) require "staff",
 * and guest paths (/account, /book/checkout, ...) require "guest".
 */

declare module "next-auth" {
  interface User {
    role?: string;
    avatarUrl?: string | null;
    audience?: "staff" | "guest";
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role?: string;
      avatarUrl?: string | null;
      audience: "staff" | "guest";
      phone?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role?: string;
    avatarUrl?: string | null;
    audience: "staff" | "guest";
    phone?: string | null;
  }
}
