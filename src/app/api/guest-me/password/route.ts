import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

/** POST /api/guest-me/password — Body: { currentPassword, newPassword } */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.audience !== "guest") {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }
  const id = Number(session.user.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    currentPassword?: string;
    newPassword?: string;
  };
  const current = body.currentPassword ?? "";
  const next = body.newPassword ?? "";
  if (next.length < 6) {
    return NextResponse.json(
      { error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" },
      { status: 400 },
    );
  }

  const account = await prisma.guestAccount.findUnique({
    where: { id },
    select: { passwordHash: true },
  });
  if (!account) {
    return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
  }
  // Passwordless / social-only guests have no `passwordHash`. They can't
  // change a password they never had — they should set one via the password
  // reset / OTP flow first.
  if (!account.passwordHash) {
    return NextResponse.json(
      {
        error:
          "حسابك بدون كلمة مرور. استخدم رمز واتساب للدخول أو اضبط كلمة مرور من خيار «نسيت كلمة المرور».",
      },
      { status: 400 },
    );
  }

  const ok = await bcrypt.compare(current, account.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "كلمة المرور الحالية غير صحيحة" },
      { status: 400 },
    );
  }

  await prisma.guestAccount.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  return NextResponse.json({ ok: true });
}
