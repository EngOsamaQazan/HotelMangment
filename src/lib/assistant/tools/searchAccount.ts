import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import {
  err,
  ok,
  type AssistantToolContext,
  type AssistantToolResult,
} from "../types";

export interface SearchAccountInput {
  query: string;
}

export interface SearchAccountOutput {
  accounts: Array<{
    id: number;
    code: string;
    name: string;
    type: string;
    normalBalance: string;
  }>;
}

export const searchAccountSchema: ToolJsonSchema = {
  name: "searchAccount",
  description:
    "ابحث في دليل الحسابات بالكود أو الاسم (يطابق جزئياً). استعمله قبل إنشاء قيد محاسبي للحصول على رقم الحساب الصحيح.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "الكود (1010 مثلاً) أو جزء من اسم الحساب (الصندوق، رواتب، …).",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export async function searchAccount(
  input: SearchAccountInput,
  _ctx: AssistantToolContext,
): Promise<AssistantToolResult<SearchAccountOutput>> {
  const q = (input?.query ?? "").trim();
  if (!q) return err({ code: "bad_input", message: "query فارغ", field: "query" });

  const accounts = await prisma.account.findMany({
    where: {
      isActive: true,
      OR: [
        { code: { contains: q } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      normalBalance: true,
    },
    orderBy: { code: "asc" },
    take: 12,
  });

  return ok({ accounts });
}
