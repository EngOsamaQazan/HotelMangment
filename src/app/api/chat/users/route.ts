import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * GET /api/chat/users?q=...
 *
 * Lightweight user directory for starting DMs / adding members. Limited to
 * basic public fields (id, name, email). Available to any signed-in user
 * via the `chat.users:view` permission (read-only, no PII beyond name/email).
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("chat.users:view");
    const selfId = Number((session.user as { id?: string | number }).id);
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(50, Number(searchParams.get("limit")) || 20);

    const users = await prisma.user.findMany({
      where: {
        id: { not: selfId },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { username: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
      },
      orderBy: { name: "asc" },
      take: limit,
    });
    return NextResponse.json(users);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/chat/users error:", error);
    return NextResponse.json(
      { error: "فشل تحميل المستخدمين" },
      { status: 500 },
    );
  }
}
