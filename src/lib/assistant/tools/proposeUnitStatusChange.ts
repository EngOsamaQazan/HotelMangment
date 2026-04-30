import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import {
  err,
  ok,
  type AssistantToolContext,
  type AssistantToolResult,
  type ProposedActionPayload,
} from "../types";

export interface ProposeUnitStatusChangeInput {
  unitId: number;
  status: "available" | "occupied" | "maintenance";
  reason?: string | null;
}

export const proposeUnitStatusChangeSchema: ToolJsonSchema = {
  name: "proposeUnitStatusChange",
  description:
    "اقترح تغيير حالة وحدة (متاحة/مشغولة/صيانة). استعملها مثلاً عندما يطلب الموظف رفع صيانة عن غرفة قبل حجزها، أو وضع غرفة في صيانة بعد المغادرة. التغيير الفعلي يتم بعد تأكيد الموظف.",
  parameters: {
    type: "object",
    properties: {
      unitId: { type: "integer", description: "رقم الوحدة من نتيجة searchUnit." },
      status: {
        type: "string",
        enum: ["available", "occupied", "maintenance"],
        description: "الحالة الجديدة المطلوبة.",
      },
      reason: {
        type: ["string", "null"],
        description: "سبب اختياري (يُحفظ في ملاحظات الوحدة).",
      },
    },
    required: ["unitId", "status", "reason"],
    additionalProperties: false,
  },
};

export async function proposeUnitStatusChange(
  input: ProposeUnitStatusChangeInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ProposedActionPayload>> {
  if (!Number.isInteger(input?.unitId) || input.unitId <= 0)
    return err({ code: "bad_input", message: "unitId غير صالح", field: "unitId" });
  const status = input?.status;
  if (!["available", "occupied", "maintenance"].includes(status))
    return err({ code: "bad_input", message: "حالة غير معروفة", field: "status" });

  const unit = await prisma.unit.findUnique({
    where: { id: input.unitId },
    select: { id: true, unitNumber: true, status: true, notes: true },
  });
  if (!unit) return err({ code: "not_found", message: "الوحدة غير موجودة" });
  if (unit.status === status)
    return err({
      code: "bad_input",
      message: `الوحدة ${unit.unitNumber} حالتها بالفعل "${status}"`,
      field: "status",
    });

  const STATUS_LABELS: Record<string, string> = {
    available: "متاحة",
    occupied: "مشغولة",
    maintenance: "صيانة",
  };
  const expiresAt = new Date(ctx.now.getTime() + 30 * 60 * 1000);
  const summary = `تغيير حالة الوحدة ${unit.unitNumber}: ${STATUS_LABELS[unit.status] ?? unit.status} → ${STATUS_LABELS[status] ?? status}${
    input.reason ? ` (${input.reason.trim()})` : ""
  }`;

  const action = await prisma.assistantAction.create({
    data: {
      conversationId: ctx.conversationId,
      kind: "unit_status_change",
      summary,
      payload: {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        fromStatus: unit.status,
        toStatus: status,
        reason: input.reason?.trim() || null,
      },
      status: "pending",
      expiresAt,
    },
  });

  return ok({
    actionId: action.id,
    kind: "unit_status_change",
    summary,
    expiresAt: expiresAt.toISOString(),
  });
}
