import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import { err, ok, type AssistantToolContext, type AssistantToolResult } from "../types";

export interface ListAvailableUnitsInput {
  /** YYYY-MM-DD; default = today (UTC). */
  checkIn?: string | null;
  numNights?: number | null;
  /** When true, also returns rooms with status="maintenance" so the assistant
   *  can offer the user to lift the maintenance flag and book. Default false. */
  includeMaintenance?: boolean | null;
}

export interface ListAvailableUnitsOutput {
  /** ISO range used for the overlap check (echoed for the model). */
  range: { checkIn: string; checkOut: string };
  units: Array<{
    id: number;
    unitNumber: string;
    floor: number;
    status: string;
    unitTypeName: string | null;
    /** True when no active/pending reservation overlaps with the range. */
    freeOnDates: boolean;
    /** True when status is anything other than "available" (e.g. maintenance). */
    blockedByStatus: boolean;
  }>;
  totalUnits: number;
}

export const listAvailableUnitsSchema: ToolJsonSchema = {
  name: "listAvailableUnits",
  description:
    "اعرض الوحدات الفاضية في الفندق لفترة معيّنة (افتراضياً اليوم لعدد الليالي المطلوب). تُرجع لكل وحدة حالتها الإدارية (متاحة/صيانة/مشغولة) وما إذا كانت متعارضة مع حجز نشط في المدى. استعملها لطلبات مثل \"شوف أي غرفة فاضية\" أو \"اعرض الغرف المتاحة الليلة\".",
  parameters: {
    type: "object",
    properties: {
      checkIn: {
        type: ["string", "null"],
        description: "تاريخ الوصول YYYY-MM-DD. الافتراضي اليوم بتوقيت UTC.",
      },
      numNights: {
        type: ["integer", "null"],
        description: "عدد الليالي. الافتراضي 1.",
      },
      includeMaintenance: {
        type: ["boolean", "null"],
        description: "اضمّ الغرف التي حالتها صيانة (مع علم blockedByStatus=true). الافتراضي false.",
      },
    },
    required: ["checkIn", "numNights", "includeMaintenance"],
    additionalProperties: false,
  },
};

export async function listAvailableUnits(
  input: ListAvailableUnitsInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ListAvailableUnitsOutput>> {
  let checkInStr = input?.checkIn?.trim() || null;
  if (!checkInStr) {
    const d = ctx.now;
    checkInStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInStr)) {
    return err({ code: "bad_input", message: "checkIn YYYY-MM-DD غير صالح", field: "checkIn" });
  }
  const numNights = Number.isInteger(input?.numNights) && input!.numNights! > 0 ? input!.numNights! : 1;
  const includeMaintenance = !!input?.includeMaintenance;

  const checkIn = new Date(checkInStr + "T00:00:00.000Z");
  const checkOut = new Date(checkIn.getTime() + numNights * 24 * 60 * 60 * 1000);

  const units = await prisma.unit.findMany({
    where: includeMaintenance
      ? {}
      : { status: { in: ["available", "occupied"] } },
    include: { unitTypeRef: { select: { nameAr: true } } },
    orderBy: { unitNumber: "asc" },
  });

  const overlaps = await prisma.reservation.findMany({
    where: {
      unitId: { in: units.map((u) => u.id) },
      status: { in: ["active", "pending", "pending_hold"] },
      AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
    },
    select: { unitId: true },
  });
  const busy = new Set(overlaps.map((r) => r.unitId));

  const total = units.length;
  const result = units
    .map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      floor: u.floor,
      status: u.status,
      unitTypeName: u.unitTypeRef?.nameAr ?? null,
      freeOnDates: !busy.has(u.id),
      blockedByStatus: u.status !== "available",
    }))
    // Truly bookable first.
    .sort((a, b) => {
      const sa = (a.freeOnDates ? 0 : 1) + (a.blockedByStatus ? 2 : 0);
      const sb = (b.freeOnDates ? 0 : 1) + (b.blockedByStatus ? 2 : 0);
      if (sa !== sb) return sa - sb;
      return a.unitNumber.localeCompare(b.unitNumber);
    })
    .slice(0, 30);

  return ok({
    range: { checkIn: checkIn.toISOString(), checkOut: checkOut.toISOString() },
    units: result,
    totalUnits: total,
  });
}
