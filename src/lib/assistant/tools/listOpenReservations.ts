import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import { ok, type AssistantToolContext, type AssistantToolResult } from "../types";

export interface ListOpenReservationsInput {
  limit?: number;
}

export interface ListOpenReservationsOutput {
  reservations: Array<{
    id: number;
    guestName: string;
    unitNumber: string;
    checkIn: string;
    checkOut: string;
    totalAmount: number;
    paidAmount: number;
    remaining: number;
    status: string;
  }>;
}

export const listOpenReservationsSchema: ToolJsonSchema = {
  name: "listOpenReservations",
  description:
    "اعرض الحجوزات النشطة الحالية (active / pending) في الفندق. مفيد لتأكيد رقم حجز قبل تسجيل دفعة عليه.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        description: "عدد النتائج المطلوبة (افتراضي 10، حد أقصى 30).",
      },
    },
    required: ["limit"],
    additionalProperties: false,
  },
};

export async function listOpenReservations(
  input: ListOpenReservationsInput,
  _ctx: AssistantToolContext,
): Promise<AssistantToolResult<ListOpenReservationsOutput>> {
  const limit = Math.max(1, Math.min(input?.limit ?? 10, 30));
  const rows = await prisma.reservation.findMany({
    where: { status: { in: ["active", "pending", "pending_hold"] } },
    include: { unit: { select: { unitNumber: true } } },
    orderBy: { checkIn: "asc" },
    take: limit,
  });

  return ok({
    reservations: rows.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      unitNumber: r.unit?.unitNumber ?? "—",
      checkIn: r.checkIn.toISOString(),
      checkOut: r.checkOut.toISOString(),
      totalAmount: r.totalAmount,
      paidAmount: r.paidAmount,
      remaining: r.remaining,
      status: r.status,
    })),
  });
}
