import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPartyBalance } from "@/lib/accounting";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.parties:view");
    const { id } = await params;
    const partyId = parseInt(id);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const party = await prisma.party.findUnique({
      where: { id: partyId },
      include: {
        arAccount: true,
        apAccount: true,
        equityAccount: true,
        drawAccount: true,
      },
    });
    if (!party) {
      return NextResponse.json({ error: "الطرف غير موجود" }, { status: 404 });
    }

    const balance = await getPartyBalance(partyId);

    return NextResponse.json({ ...party, balance: balance.balance });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/accounting/parties/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch party" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.parties:edit");
    const { id } = await params;
    const partyId = parseInt(id);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      phone,
      email,
      nationalId,
      notes,
      isActive,
      code,
      // employee-specific
      baseSalary,
      commissionRate,
      salaryPayDay,
      hireDate,
      terminationDate,
      jobTitle,
    } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (nationalId !== undefined) data.nationalId = nationalId;
    if (notes !== undefined) data.notes = notes;
    if (isActive !== undefined) data.isActive = isActive;
    if (code !== undefined) data.code = code;
    if (baseSalary !== undefined)
      data.baseSalary = baseSalary === null || baseSalary === "" ? null : Number(baseSalary);
    if (commissionRate !== undefined)
      data.commissionRate =
        commissionRate === null || commissionRate === "" ? null : Number(commissionRate);
    if (salaryPayDay !== undefined)
      data.salaryPayDay = salaryPayDay === null || salaryPayDay === "" ? null : Number(salaryPayDay);
    if (hireDate !== undefined)
      data.hireDate = hireDate ? new Date(hireDate) : null;
    if (terminationDate !== undefined)
      data.terminationDate = terminationDate ? new Date(terminationDate) : null;
    if (jobTitle !== undefined) data.jobTitle = jobTitle || null;

    const party = await prisma.party.update({
      where: { id: partyId },
      data,
    });

    return NextResponse.json(party);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/accounting/parties/[id] error:", error);
    return NextResponse.json({ error: "Failed to update party" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("accounting.parties:delete");
    const { id } = await params;
    const partyId = parseInt(id);
    if (isNaN(partyId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const lineCount = await prisma.journalLine.count({ where: { partyId } });
    if (lineCount > 0) {
      await prisma.party.update({
        where: { id: partyId },
        data: { isActive: false },
      });
      return NextResponse.json({ message: "الطرف له حركات، تم تعطيله بدل حذفه" });
    }

    await prisma.party.delete({ where: { id: partyId } });
    return NextResponse.json({ message: "تم الحذف" });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/accounting/parties/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete party" }, { status: 500 });
  }
}
