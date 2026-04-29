import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";

function sessionUserId(session: { user?: { id?: string | number } }): number {
  return Number(session.user?.id);
}

export async function GET() {
  try {
    const session = await requirePermission("profile:view");
    const userId = sessionUserId(session);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        avatarUrl: true,
        whatsappPhone: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json(user);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/me error:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("profile:edit");
    const userId = sessionUserId(session);

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, email, username, whatsappPhone } = body ?? {};

    const updateData: {
      name?: string;
      email?: string;
      username?: string | null;
      whatsappPhone?: string | null;
    } = {};

    if (typeof name === "string") {
      const clean = name.trim();
      if (clean.length < 2) {
        return NextResponse.json(
          { error: "الاسم قصير جداً" },
          { status: 400 },
        );
      }
      updateData.name = clean;
    }

    if (typeof email === "string" && email !== existing.email) {
      const clean = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        return NextResponse.json(
          { error: "صيغة البريد الإلكتروني غير صحيحة" },
          { status: 400 },
        );
      }
      const taken = await prisma.user.findUnique({ where: { email: clean } });
      if (taken && taken.id !== userId) {
        return NextResponse.json(
          { error: "البريد الإلكتروني مستخدم بالفعل" },
          { status: 409 },
        );
      }
      updateData.email = clean;
    }

    if (whatsappPhone !== undefined) {
      const raw =
        typeof whatsappPhone === "string" ? whatsappPhone.trim() : "";
      if (!raw) {
        updateData.whatsappPhone = null;
      } else {
        const norm = normalizeWhatsAppPhone(raw);
        if (!norm) {
          return NextResponse.json(
            { error: "رقم واتساب غير صالح" },
            { status: 400 },
          );
        }
        updateData.whatsappPhone = norm;
      }
    }

    if (username !== undefined) {
      const clean =
        typeof username === "string" && username.trim().length > 0
          ? username.trim()
          : null;
      if (clean !== existing.username) {
        if (clean) {
          if (!/^[a-zA-Z0-9._-]{3,50}$/.test(clean)) {
            return NextResponse.json(
              {
                error:
                  "اسم المستخدم يجب أن يكون 3-50 محرفاً (أحرف، أرقام، . _ -)",
              },
              { status: 400 },
            );
          }
          const taken = await prisma.user.findUnique({
            where: { username: clean },
          });
          if (taken && taken.id !== userId) {
            return NextResponse.json(
              { error: "اسم المستخدم مستخدم بالفعل" },
              { status: 409 },
            );
          }
        }
        updateData.username = clean;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        avatarUrl: true,
        whatsappPhone: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/me error:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 },
    );
  }
}
