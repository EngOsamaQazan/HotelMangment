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

export interface ProposePayrollAdvanceInput {
  partyId: number;
  amount: number;
  paymentMethod?: "cash" | "bank" | "wallet" | null;
  date?: string | null;
  notes?: string | null;
}

export const proposePayrollAdvanceSchema: ToolJsonSchema = {
  name: "proposePayrollAdvance",
  description:
    "اقترح صرف سُلفة لموظف. الأداة تنشئ مسودة قابلة للتأكيد فقط؛ التنفيذ يخصم الصندوق ويثبّت السلفة على الذمم.",
  parameters: {
    type: "object",
    properties: {
      partyId: { type: "integer", description: "رقم الموظف من نتيجة searchParty (type=employee)." },
      amount: { type: "number", description: "قيمة السلفة بالدينار الأردني." },
      paymentMethod: {
        type: ["string", "null"],
        enum: ["cash", "bank", "wallet", null],
        description: "وسيلة الصرف. الافتراضي cash.",
      },
      date: {
        type: ["string", "null"],
        description: "تاريخ الصرف بصيغة YYYY-MM-DD. الافتراضي اليوم.",
      },
      notes: { type: ["string", "null"], description: "ملاحظات اختيارية." },
    },
    required: ["partyId", "amount", "paymentMethod", "date", "notes"],
    additionalProperties: false,
  },
};

export async function proposePayrollAdvance(
  input: ProposePayrollAdvanceInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ProposedActionPayload>> {
  if (!Number.isInteger(input?.partyId) || input.partyId <= 0)
    return err({ code: "bad_input", message: "partyId غير صالح", field: "partyId" });
  const amount = Number(input?.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    return err({ code: "bad_input", message: "قيمة السلفة يجب أن تكون موجبة", field: "amount" });

  const employee = await prisma.party.findUnique({
    where: { id: input.partyId },
    select: { id: true, name: true, type: true },
  });
  if (!employee) return err({ code: "not_found", message: "الطرف غير موجود" });
  if (employee.type !== "employee")
    return err({ code: "bad_input", message: "الطرف ليس موظفاً", field: "partyId" });

  let date = input?.date?.trim() || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return err({ code: "bad_input", message: "تاريخ غير صالح (YYYY-MM-DD)", field: "date" });
  }
  if (!date) {
    const now = ctx.now;
    date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  const method = input.paymentMethod ?? "cash";
  const expiresAt = new Date(ctx.now.getTime() + 30 * 60 * 1000);
  const summary = `سُلفة ${amount.toFixed(2)} د.أ للموظف ${employee.name} (${method})`;

  const action = await prisma.assistantAction.create({
    data: {
      conversationId: ctx.conversationId,
      kind: "payroll_advance",
      summary,
      payload: {
        partyId: employee.id,
        partyName: employee.name,
        amount,
        paymentMethod: method,
        date,
        notes: input.notes?.trim() || null,
      },
      status: "pending",
      expiresAt,
    },
  });

  return ok({
    actionId: action.id,
    kind: "payroll_advance",
    summary,
    expiresAt: expiresAt.toISOString(),
  });
}
