import { NextResponse } from "next/server";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { updateAssistantAction } from "@/lib/assistant/executor";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/assistant/actions/[id]
 *
 * Lets the staff member edit a `pending` AssistantAction draft before
 * confirming it. Body shape:
 *   {
 *     payloadPatch?: Record<string, unknown>,  // shallow-merged into payload
 *     summary?: string                         // optional new summary
 *   }
 *
 * The executor's `updateAssistantAction` enforces ownership, status, and
 * per-kind validation (balanced journal, positive amounts, allowed unit
 * statuses, …). Returns the refreshed payload + summary so the UI can
 * re-render the card without an extra fetch.
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);
    const { id } = await params;
    const actionId = Number(id);
    if (!Number.isFinite(actionId)) {
      return NextResponse.json({ error: "id غير صالح" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      payloadPatch?: Record<string, unknown>;
      summary?: string;
    };
    const result = await updateAssistantAction(actionId, userId, {
      payloadPatch:
        body.payloadPatch && typeof body.payloadPatch === "object" && !Array.isArray(body.payloadPatch)
          ? body.payloadPatch
          : undefined,
      summary: typeof body.summary === "string" ? body.summary : undefined,
    });

    if (!result.ok) {
      const status =
        result.errorCode === "forbidden"
          ? 403
          : result.errorCode === "not_found"
            ? 404
            : result.errorCode === "invalid_state"
              ? 409
              : result.errorCode === "validation"
                ? 422
                : 500;
      return NextResponse.json(
        { error: result.message, errorCode: result.errorCode },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      payload: result.payload,
      summary: result.summary,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("PATCH /api/assistant/actions/[id]", e);
    return NextResponse.json({ error: "فشل تعديل المسودة" }, { status: 500 });
  }
}
