import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { encryptSecret } from "@/lib/booking/encryption";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("settings.booking:edit");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.label !== undefined) data.label = String(body.label);
    if (body.email !== undefined) data.email = String(body.email).toLowerCase();
    if (body.password !== undefined && body.password)
      data.passwordEnc = encryptSecret(String(body.password));
    if (body.twoFaSecret !== undefined)
      data.twoFaSecretEnc = body.twoFaSecret ? encryptSecret(String(body.twoFaSecret)) : null;
    if (body.propertyId !== undefined) data.propertyId = body.propertyId || null;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    const updated = await prisma.bookingCredential.update({
      where: { id },
      data,
      select: {
        id: true,
        label: true,
        email: true,
        propertyId: true,
        isActive: true,
        lastLoginAt: true,
        lastLoginOk: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("PATCH /api/booking/credentials/[id]:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("settings.booking:delete");
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    await prisma.bookingCredential.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("DELETE /api/booking/credentials/[id]:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
