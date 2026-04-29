import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.cost-centers:edit");
    const { id } = await params;
    const centerId = parseInt(id, 10);
    if (isNaN(centerId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.costCenter.findUnique({
      where: { id: centerId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "مركز التكلفة غير موجود" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, description, isActive, parentId } = body ?? {};

    const data: Record<string, unknown> = {};
    if (typeof name === "string") {
      const trimmed = name.trim();
      if (!trimmed) {
        return NextResponse.json(
          { error: "الاسم لا يمكن أن يكون فارغاً" },
          { status: 400 }
        );
      }
      data.name = trimmed;
    }
    if (description !== undefined) {
      data.description =
        typeof description === "string" && description.trim().length > 0
          ? description.trim()
          : null;
    }
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (parentId !== undefined) {
      if (parentId === null || parentId === "") {
        data.parentId = null;
      } else {
        const parentIdNum = Number(parentId);
        if (parentIdNum === centerId) {
          return NextResponse.json(
            { error: "لا يمكن جعل المركز أباً لنفسه" },
            { status: 400 }
          );
        }
        const parent = await prisma.costCenter.findUnique({
          where: { id: parentIdNum },
        });
        if (!parent) {
          return NextResponse.json(
            { error: "مركز التكلفة الأب غير موجود" },
            { status: 400 }
          );
        }
        data.parentId = parentIdNum;
      }
    }

    const center = await prisma.costCenter.update({
      where: { id: centerId },
      data,
    });

    return NextResponse.json(center);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/accounting/cost-centers/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update cost center" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.cost-centers:delete");
    const { id } = await params;
    const centerId = parseInt(id, 10);
    if (isNaN(centerId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existing = await prisma.costCenter.findUnique({
      where: { id: centerId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "مركز التكلفة غير موجود" },
        { status: 404 }
      );
    }

    const childCount = await prisma.costCenter.count({
      where: { parentId: centerId },
    });
    if (childCount > 0) {
      return NextResponse.json(
        {
          error:
            "لا يمكن حذف مركز تكلفة يحتوي على مراكز فرعية. احذف الفرعية أولاً أو انقلها.",
        },
        { status: 400 }
      );
    }

    const lineCount = await prisma.journalLine.count({
      where: { costCenterId: centerId },
    });
    if (lineCount > 0) {
      await prisma.costCenter.update({
        where: { id: centerId },
        data: { isActive: false },
      });
      return NextResponse.json({
        message: "مركز التكلفة مرتبط بقيود محاسبية، تم تعطيله بدل حذفه",
      });
    }

    await prisma.costCenter.delete({ where: { id: centerId } });
    return NextResponse.json({ message: "تم الحذف" });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/accounting/cost-centers/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete cost center" },
      { status: 500 }
    );
  }
}
