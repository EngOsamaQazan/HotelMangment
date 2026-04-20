import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { encryptSecret, maskEmail } from "@/lib/booking/encryption";

/**
 * GET /api/booking/credentials — list credentials (email is masked, password never returned).
 */
export async function GET() {
  try {
    await requirePermission("settings.booking:view");
    const rows = await prisma.bookingCredential.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        label: true,
        email: true,
        propertyId: true,
        isActive: true,
        lastLoginAt: true,
        lastLoginOk: true,
        createdAt: true,
      },
    });
    return NextResponse.json(
      rows.map((r) => ({ ...r, emailMasked: maskEmail(r.email) })),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("GET /api/booking/credentials:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/** POST — create a credential. Password is encrypted before storage. */
export async function POST(request: Request) {
  try {
    await requirePermission("settings.booking:create");
    const body = await request.json();
    const label = String(body.label || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const twoFaSecret = body.twoFaSecret ? String(body.twoFaSecret) : null;
    const propertyId = body.propertyId ? String(body.propertyId) : null;

    if (!label) return NextResponse.json({ error: "التسمية مطلوبة" }, { status: 400 });
    if (!email || !email.includes("@"))
      return NextResponse.json({ error: "بريد إلكتروني غير صالح" }, { status: 400 });
    if (!password || password.length < 4)
      return NextResponse.json({ error: "كلمة المرور قصيرة جدًا" }, { status: 400 });

    const created = await prisma.bookingCredential.create({
      data: {
        label,
        email,
        passwordEnc: encryptSecret(password),
        twoFaSecretEnc: twoFaSecret ? encryptSecret(twoFaSecret) : null,
        propertyId,
        isActive: body.isActive !== false,
      },
      select: {
        id: true,
        label: true,
        email: true,
        propertyId: true,
        isActive: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ ...created, emailMasked: maskEmail(created.email) }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/booking/credentials:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
