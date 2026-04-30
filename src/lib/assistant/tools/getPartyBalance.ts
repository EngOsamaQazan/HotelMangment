import "server-only";
import type { ToolJsonSchema } from "@/lib/llm/types";
import { getPartyBalance as accountingGetPartyBalance } from "@/lib/accounting";
import { prisma } from "@/lib/prisma";
import { err, ok, type AssistantToolContext, type AssistantToolResult } from "../types";

export interface GetPartyBalanceInput {
  partyId: number;
}

export interface GetPartyBalanceOutput {
  partyId: number;
  partyName: string;
  partyType: string;
  debit: number;
  credit: number;
  /** Positive = الطرف مدين علينا، سالب = نحن مدينون له. */
  balance: number;
}

export const getPartyBalanceSchema: ToolJsonSchema = {
  name: "getPartyBalance",
  description:
    "اجلب الرصيد المحاسبي الحالي لطرف (موظف، شريك، مورد). مفيد قبل تسجيل سُلفة أو تسوية مع الشريك.",
  parameters: {
    type: "object",
    properties: {
      partyId: { type: "integer", description: "رقم الطرف من نتيجة searchParty." },
    },
    required: ["partyId"],
    additionalProperties: false,
  },
};

export async function getPartyBalance(
  input: GetPartyBalanceInput,
  _ctx: AssistantToolContext,
): Promise<AssistantToolResult<GetPartyBalanceOutput>> {
  if (!Number.isInteger(input?.partyId) || input.partyId <= 0) {
    return err({ code: "bad_input", message: "partyId غير صالح", field: "partyId" });
  }
  const party = await prisma.party.findUnique({
    where: { id: input.partyId },
    select: { id: true, name: true, type: true },
  });
  if (!party) return err({ code: "not_found", message: "الطرف غير موجود" });

  const bal = await accountingGetPartyBalance(input.partyId);
  return ok({
    partyId: party.id,
    partyName: party.name,
    partyType: party.type,
    debit: bal.debit,
    credit: bal.credit,
    balance: bal.balance,
  });
}
