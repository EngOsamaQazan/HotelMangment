import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("settings.audit_log:view");

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 50));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    const from = sp.get("from");
    const to = sp.get("to");
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to + "T23:59:59.999Z");
    }

    const userId = sp.get("userId");
    if (userId) where.userId = Number(userId);

    const action = sp.get("action");
    if (action) where.action = action;

    const resource = sp.get("resource");
    if (resource) where.resource = resource;

    const search = sp.get("search");
    if (search) {
      where.OR = [
        { summary: { contains: search, mode: "insensitive" } },
        { userEmail: { contains: search, mode: "insensitive" } },
        { userName: { contains: search, mode: "insensitive" } },
        { resourceId: { contains: search, mode: "insensitive" } },
        { path: { contains: search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      rows,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e) {
    const authErr = handleAuthError(e);
    if (authErr) return authErr;
    return NextResponse.json({ error: "خطأ داخلي" }, { status: 500 });
  }
}
