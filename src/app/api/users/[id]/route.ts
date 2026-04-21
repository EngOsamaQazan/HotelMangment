import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import {
  requirePermission,
  handleAuthError,
  invalidatePermissionsCache,
} from "@/lib/permissions/guard";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("settings.users:edit");
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, email, username, password, role } = body;

    const updateData: {
      name?: string;
      email?: string;
      username?: string | null;
      passwordHash?: string;
      role?: "admin" | "receptionist" | "accountant";
    } = {};

    if (name !== undefined) updateData.name = name;
    if (role !== undefined) {
      const validRoles = ["admin", "receptionist", "accountant"];
      if (!validRoles.includes(role)) {
        return NextResponse.json(
          { error: `Invalid role. Must be one of: ${validRoles.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.role = role;
    }

    if (email !== undefined && email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        );
      }
      updateData.email = email;
    }

    if (username !== undefined) {
      const usernameClean =
        typeof username === "string" && username.trim().length > 0
          ? username.trim()
          : null;
      if (usernameClean !== existing.username) {
        if (usernameClean) {
          const taken = await prisma.user.findUnique({
            where: { username: usernameClean },
          });
          if (taken && taken.id !== userId) {
            return NextResponse.json(
              { error: "A user with this username already exists" },
              { status: 409 }
            );
          }
        }
        updateData.username = usernameClean;
      }
    }

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      // Keep UserRole in sync with the legacy `role` column.
      if (updateData.role) {
        const role = await tx.role.findUnique({
          where: { key: updateData.role },
        });
        if (role) {
          await tx.userRole.deleteMany({ where: { userId } });
          await tx.userRole.create({
            data: { userId, roleId: role.id },
          });
        }
      }
      return updated;
    });

    invalidatePermissionsCache(userId);
    return NextResponse.json(user);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PUT /api/users/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("settings.users:delete");
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ message: "User deleted successfully" });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/users/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
