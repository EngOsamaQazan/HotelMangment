import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET() {
  try {
    await requirePermission("settings.users:view");
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/users error:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("settings.users:create");
    const body = await request.json();
    const { name, email, username, password, role } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Missing required fields: name, email, password" },
        { status: 400 }
      );
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const usernameClean =
      typeof username === "string" && username.trim().length > 0
        ? username.trim()
        : null;
    if (usernameClean) {
      const existingUsername = await prisma.user.findUnique({
        where: { username: usernameClean },
      });
      if (existingUsername) {
        return NextResponse.json(
          { error: "A user with this username already exists" },
          { status: 409 }
        );
      }
    }

    const validRoles = ["admin", "receptionist", "accountant"];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const roleKey = role || "receptionist";

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          username: usernameClean,
          passwordHash,
          role: roleKey,
        },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          role: true,
          createdAt: true,
        },
      });
      const dbRole = await tx.role.findUnique({ where: { key: roleKey } });
      if (dbRole) {
        await tx.userRole.create({
          data: { userId: created.id, roleId: dbRole.id },
        });
      }
      return created;
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/users error:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
