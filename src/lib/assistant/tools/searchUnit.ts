import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import { err, ok, type AssistantToolContext, type AssistantToolResult } from "../types";

export interface SearchUnitInput {
  query: string;
}

export interface SearchUnitOutput {
  units: Array<{
    id: number;
    unitNumber: string;
    floor: number;
    status: string;
    unitTypeName: string | null;
  }>;
}

export const searchUnitSchema: ToolJsonSchema = {
  name: "searchUnit",
  description:
    "ابحث عن وحدة (غرفة/شقة) برقمها أو طابقها. استعمله قبل اقتراح حجز أو طلب صيانة لتأكيد رقم الوحدة الصحيح.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "رقم الوحدة أو جزء منه." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

export async function searchUnit(
  input: SearchUnitInput,
  _ctx: AssistantToolContext,
): Promise<AssistantToolResult<SearchUnitOutput>> {
  const q = (input?.query ?? "").trim();
  if (!q) return err({ code: "bad_input", message: "query فارغ", field: "query" });

  const rows = await prisma.unit.findMany({
    where: {
      OR: [{ unitNumber: { contains: q, mode: "insensitive" } }],
    },
    include: { unitTypeRef: { select: { nameAr: true } } },
    orderBy: { unitNumber: "asc" },
    take: 10,
  });

  return ok({
    units: rows.map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      floor: u.floor,
      status: u.status,
      unitTypeName: u.unitTypeRef?.nameAr ?? null,
    })),
  });
}
