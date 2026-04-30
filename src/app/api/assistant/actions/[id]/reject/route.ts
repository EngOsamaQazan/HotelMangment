import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { rejectAssistantAction } from "@/lib/assistant/executor";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const actionId = Number(id);
    if (!Number.isFinite(actionId)) {
      return NextResponse.json({ error: "id غير صالح" }, { status: 400 });
    }

    const result = await rejectAssistantAction(actionId, userId);
    if (!result.ok) {
      const status =
        result.errorCode === "forbidden"
          ? 403
          : result.errorCode === "not_found"
            ? 404
            : result.errorCode === "invalid_state"
              ? 400
              : 500;
      return NextResponse.json({ error: result.message, errorCode: result.errorCode }, { status });
    }
    return NextResponse.json({ ok: true, message: result.message });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/actions/[id]/reject", e);
    return NextResponse.json({ error: "فشل إلغاء المسودة" }, { status: 500 });
  }
}
