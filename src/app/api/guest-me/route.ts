import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

/**
 * Guest self-profile endpoint. Requires a NextAuth session with
 * `audience === "guest"`. The middleware already rejects staff sessions
 * for /api/guest-me/* so this only acts as a defense-in-depth check.
 */
async function requireGuest() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.audience !== "guest") {
    return null;
  }
  const id = Number(session.user.id);
  if (!Number.isFinite(id)) return null;
  return { session, guestId: id };
}

export async function GET() {
  const ctx = await requireGuest();
  if (!ctx) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const guest = await prisma.guestAccount.findUnique({
    where: { id: ctx.guestId },
    select: {
      id: true,
      phone: true,
      phoneVerifiedAt: true,
      email: true,
      emailVerifiedAt: true,
      fullName: true,
      nationality: true,
      idNumber: true,
      preferredLang: true,
      avatarUrl: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!guest) {
    return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
  }
  return NextResponse.json(guest);
}

export async function PATCH(request: Request) {
  const ctx = await requireGuest();
  if (!ctx) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    email?: string | null;
    nationality?: string | null;
    idNumber?: string | null;
    preferredLang?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (typeof body.fullName === "string" && body.fullName.trim().length >= 3) {
    data.fullName = body.fullName.trim();
  }
  if (body.email !== undefined) {
    const email = (body.email ?? "").trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "البريد الإلكتروني غير صالح" },
        { status: 400 },
      );
    }
    if (email) {
      const taken = await prisma.guestAccount.findFirst({
        where: { email, id: { not: ctx.guestId } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: "هذا البريد مسجّل على حساب آخر" },
          { status: 409 },
        );
      }
    }
    data.email = email;
    data.emailVerifiedAt = null;
  }
  if (body.nationality !== undefined) {
    data.nationality = (body.nationality ?? "").toString().trim() || null;
  }
  if (body.idNumber !== undefined) {
    data.idNumber = (body.idNumber ?? "").toString().trim() || null;
  }
  if (body.preferredLang === "en" || body.preferredLang === "ar") {
    data.preferredLang = body.preferredLang;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا يوجد تعديلات" }, { status: 400 });
  }

  const updated = await prisma.guestAccount.update({
    where: { id: ctx.guestId },
    data,
    select: {
      id: true,
      phone: true,
      email: true,
      fullName: true,
      nationality: true,
      idNumber: true,
      preferredLang: true,
    },
  });
  return NextResponse.json(updated);
}
