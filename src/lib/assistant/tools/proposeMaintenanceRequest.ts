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

export interface ProposeMaintenanceInput {
  unitId: number;
  description: string;
  contractor?: string | null;
  cost?: number | null;
  notes?: string | null;
}

export const proposeMaintenanceRequestSchema: ToolJsonSchema = {
  name: "proposeMaintenanceRequest",
  description:
    "اقترح فتح طلب صيانة على وحدة معيّنة. الطلب لا يُسجَّل إلا بعد تأكيد الموظف.",
  parameters: {
    type: "object",
    properties: {
      unitId: { type: "integer", description: "رقم الوحدة من نتيجة searchUnit." },
      description: { type: "string", description: "وصف العطل أو الطلب." },
      contractor: { type: ["string", "null"], description: "اسم الفني/المقاول إن وُجد." },
      cost: { type: ["number", "null"], description: "التكلفة المقدّرة بالدينار الأردني." },
      notes: { type: ["string", "null"], description: "ملاحظات إضافية." },
    },
    required: ["unitId", "description", "contractor", "cost", "notes"],
    additionalProperties: false,
  },
};

export async function proposeMaintenanceRequest(
  input: ProposeMaintenanceInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ProposedActionPayload>> {
  if (!Number.isInteger(input?.unitId) || input.unitId <= 0)
    return err({ code: "bad_input", message: "unitId غير صالح", field: "unitId" });
  const description = (input?.description ?? "").trim();
  if (!description) return err({ code: "bad_input", message: "وصف الصيانة مطلوب", field: "description" });

  const unit = await prisma.unit.findUnique({
    where: { id: input.unitId },
    select: { id: true, unitNumber: true },
  });
  if (!unit) return err({ code: "not_found", message: "الوحدة غير موجودة" });

  const expiresAt = new Date(ctx.now.getTime() + 30 * 60 * 1000);
  const cost = Number.isFinite(input.cost) ? Math.max(0, Number(input.cost)) : 0;
  const summary = `طلب صيانة للوحدة ${unit.unitNumber}: ${description}${
    cost > 0 ? ` (${cost.toFixed(2)} د.أ)` : ""
  }`;

  const action = await prisma.assistantAction.create({
    data: {
      conversationId: ctx.conversationId,
      kind: "maintenance_create",
      summary,
      payload: {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        description,
        contractor: input.contractor?.trim() || null,
        cost,
        notes: input.notes?.trim() || null,
      },
      status: "pending",
      expiresAt,
    },
  });

  return ok({
    actionId: action.id,
    kind: "maintenance_create",
    summary,
    expiresAt: expiresAt.toISOString(),
  });
}
