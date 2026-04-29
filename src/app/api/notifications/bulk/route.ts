import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";

/**
 * POST /api/notifications/bulk
 *
 * Bulk action over many ids at once — used by the multi-select toolbar in
 * the notification center.
 *
 * body shapes (only one of `ids` / `all` is honoured):
 *   { action: "read" | "unread" | "archive" | "unarchive", ids: number[] }
 *   { action: "read" | "unread" | "archive" | "unarchive", all: true,
 *     filter?: { unreadOnly?: boolean; category?: string; type?: string } }
 *
 * The "all + filter" form is what the "تمييز الكل مقروء" / "أرشفة الكل"
 * sticky-bar buttons use; it lets us archive/mark-read every row in the
 * current view without round-tripping through pagination.
 */
type BulkAction = "read" | "unread" | "archive" | "unarchive";

const ACTIONS: Record<BulkAction, () => Record<string, Date | null>> = {
  read: () => ({ readAt: new Date() }),
  unread: () => ({ readAt: null }),
  archive: () => ({ archivedAt: new Date() }),
  unarchive: () => ({ archivedAt: null }),
};

export async function POST(request: Request) {
  try {
    const session = await requirePermission("notifications:view");
    const userId = Number((session.user as { id?: string | number }).id);
    const body = (await request.json().catch(() => ({}))) as {
      action?: BulkAction;
      ids?: number[];
      all?: boolean;
      filter?: {
        unreadOnly?: boolean;
        category?: string;
        type?: string;
      };
    };

    const action = body.action;
    if (!action || !(action in ACTIONS)) {
      return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
    }
    if ((action === "archive" || action === "unarchive") &&
        !(await ensure(session, "notifications:archive"))) {
      return NextResponse.json(
        { error: "ممنوع — لا تملك صلاحية الأرشفة" },
        { status: 403 },
      );
    }

    const data = ACTIONS[action]();

    if (Array.isArray(body.ids) && body.ids.length) {
      const ids = body.ids.map(Number).filter(Number.isFinite);
      const r = await prisma.notification.updateMany({
        where: { userId, id: { in: ids } },
        data,
      });
      return NextResponse.json({ ok: true, count: r.count });
    }

    if (body.all === true) {
      const f = body.filter ?? {};
      const r = await prisma.notification.updateMany({
        where: {
          userId,
          ...(f.unreadOnly ? { readAt: null } : {}),
          ...(f.category ? { category: f.category } : {}),
          ...(f.type ? { type: f.type } : {}),
        },
        data,
      });
      return NextResponse.json({ ok: true, count: r.count });
    }

    return NextResponse.json(
      { error: "لا توجد معرفات" },
      { status: 400 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    console.error("POST /api/notifications/bulk error:", error);
    return NextResponse.json(
      { error: "فشل تنفيذ الإجراء الجماعي" },
      { status: 500 },
    );
  }
}

import type { Session } from "next-auth";
import { hasPermission } from "@/lib/permissions/guard";

async function ensure(session: Session, key: string): Promise<boolean> {
  const userId = Number((session.user as { id?: string | number }).id);
  if (!Number.isFinite(userId)) return false;
  return hasPermission(userId, key);
}
