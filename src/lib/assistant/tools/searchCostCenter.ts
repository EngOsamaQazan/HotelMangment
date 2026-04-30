import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import { err, ok, type AssistantToolContext, type AssistantToolResult } from "../types";

export interface SearchCostCenterInput {
  query: string;
}

export interface SearchCostCenterOutput {
  costCenters: Array<{ id: number; code: string; name: string }>;
}

export const searchCostCenterSchema: ToolJsonSchema = {
  name: "searchCostCenter",
  description:
    "ابحث عن مركز تكلفة بالكود أو الاسم. اختياري — استعمله فقط إذا أراد الموظف توسيم القيد بمركز تكلفة محدد (إدارة/فرع/مشروع).",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "كود المركز أو جزء من اسمه." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export async function searchCostCenter(
  input: SearchCostCenterInput,
  _ctx: AssistantToolContext,
): Promise<AssistantToolResult<SearchCostCenterOutput>> {
  const q = (input?.query ?? "").trim();
  if (!q) return err({ code: "bad_input", message: "query فارغ", field: "query" });

  const costCenters = await prisma.costCenter.findMany({
    where: {
      isActive: true,
      OR: [
        { code: { contains: q } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
    take: 10,
  });

  return ok({ costCenters });
}
