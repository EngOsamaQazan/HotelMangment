import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    avatarUrl?: string | null;
  }
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      avatarUrl?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: string;
    id: string;
    avatarUrl?: string | null;
  }
}
