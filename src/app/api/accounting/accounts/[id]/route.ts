import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.accounts:edit");
    const { id } = await params;
    const accountId = parseInt(id);
    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.account.findUnique({ where: { id: accountId } });
    if (!existing) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    }

    const body = await request.json();
    const { name, subtype, description, isActive, parentId } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (subtype !== undefined) data.subtype = subtype;
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) {
      if (existing.isSystem && !isActive) {
        return NextResponse.json(
          { error: "لا يمكن تعطيل حساب نظامي" },
          { status: 400 }
        );
      }
      data.isActive = isActive;
    }
    if (parentId !== undefined) data.parentId = parentId ? Number(parentId) : null;

    const account = await prisma.account.update({
      where: { id: accountId },
      data,
    });

    return NextResponse.json(account);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/accounting/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.accounts:delete");
    const { id } = await params;
    const accountId = parseInt(id);
    if (isNaN(accountId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.account.findUnique({ where: { id: accountId } });
    if (!existing) {
      return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
    }
    if (existing.isSystem) {
      return NextResponse.json(
        { error: "لا يمكن حذف حساب نظامي" },
        { status: 400 }
      );
    }

    const lineCount = await prisma.journalLine.count({ where: { accountId } });
    if (lineCount > 0) {
      await prisma.account.update({
        where: { id: accountId },
        data: { isActive: false },
      });
      return NextResponse.json({ message: "الحساب يحتوي حركات، تم تعطيله بدل حذفه" });
    }

    await prisma.account.delete({ where: { id: accountId } });
    return NextResponse.json({ message: "تم الحذف" });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/accounting/accounts/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
