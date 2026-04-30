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

export interface ProposeReservationInput {
  unitId: number;
  guestName: string;
  phone?: string | null;
  numNights: number;
  checkIn: string;
  unitPrice: number;
  paidAmount?: number | null;
  paymentMethod?: "cash" | "bank" | "wallet" | null;
  numGuests?: number | null;
  notes?: string | null;
}

export const proposeReservationSchema: ToolJsonSchema = {
  name: "proposeReservation",
  description:
    "اقترح حجزاً جديداً (إقامة كاملة). الحجز يُنشأ فعلياً فقط بعد تأكيد الموظف. السعر الإجمالي = unitPrice × numNights، والمتبقي = الإجمالي − paidAmount.",
  parameters: {
    type: "object",
    properties: {
      unitId: { type: "integer", description: "رقم الوحدة من نتيجة searchUnit." },
      guestName: { type: "string", description: "اسم الضيف الكامل." },
      phone: { type: ["string", "null"], description: "هاتف الضيف." },
      numNights: { type: "integer", description: "عدد الليالي (>= 1)." },
      checkIn: { type: "string", description: "تاريخ الوصول YYYY-MM-DD." },
      unitPrice: { type: "number", description: "سعر الليلة بالدينار الأردني." },
      paidAmount: { type: ["number", "null"], description: "المدفوع مقدّماً (افتراضي 0)." },
      paymentMethod: {
        type: ["string", "null"],
        enum: ["cash", "bank", "wallet", null],
        description: "وسيلة الدفع.",
      },
      numGuests: { type: ["integer", "null"], description: "عدد النزلاء (افتراضي 1)." },
      notes: { type: ["string", "null"], description: "ملاحظات." },
    },
    required: [
      "unitId",
      "guestName",
      "phone",
      "numNights",
      "checkIn",
      "unitPrice",
      "paidAmount",
      "paymentMethod",
      "numGuests",
      "notes",
    ],
    additionalProperties: false,
  },
};

export async function proposeReservation(
  input: ProposeReservationInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ProposedActionPayload>> {
  if (!Number.isInteger(input?.unitId) || input.unitId <= 0)
    return err({ code: "bad_input", message: "unitId غير صالح", field: "unitId" });
  const guestName = (input?.guestName ?? "").trim();
  if (!guestName) return err({ code: "bad_input", message: "اسم الضيف مطلوب", field: "guestName" });
  const numNights = Number(input?.numNights);
  if (!Number.isInteger(numNights) || numNights < 1)
    return err({ code: "bad_input", message: "numNights >= 1", field: "numNights" });
  const unitPrice = Number(input?.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0)
    return err({ code: "bad_input", message: "unitPrice موجب مطلوب", field: "unitPrice" });
  const checkInStr = input?.checkIn?.trim();
  if (!checkInStr || !/^\d{4}-\d{2}-\d{2}$/.test(checkInStr))
    return err({ code: "bad_input", message: "checkIn YYYY-MM-DD مطلوب", field: "checkIn" });

  const unit = await prisma.unit.findUnique({
    where: { id: input.unitId },
    select: { id: true, unitNumber: true, status: true },
  });
  if (!unit) return err({ code: "not_found", message: "الوحدة غير موجودة" });

  const checkIn = new Date(checkInStr + "T00:00:00.000Z");
  const checkOut = new Date(checkIn.getTime() + numNights * 24 * 60 * 60 * 1000);

  // Soft availability hint (executor performs the authoritative overlap check).
  const conflict = await prisma.reservation.findFirst({
    where: {
      unitId: unit.id,
      status: { in: ["active", "pending"] },
      AND: [
        { checkIn: { lt: checkOut } },
        { checkOut: { gt: checkIn } },
      ],
    },
    select: { id: true, guestName: true },
  });
  if (conflict) {
    return err({
      code: "bad_input",
      message: `الوحدة ${unit.unitNumber} محجوزة في هذه الفترة (#${conflict.id} - ${conflict.guestName}).`,
    });
  }

  const totalAmount = +(unitPrice * numNights).toFixed(2);
  const paidAmount = Math.max(0, Number(input.paidAmount) || 0);
  const remaining = +(totalAmount - paidAmount).toFixed(2);
  const expiresAt = new Date(ctx.now.getTime() + 30 * 60 * 1000);
  const summary = `حجز ${guestName} في الوحدة ${unit.unitNumber} لـ ${numNights} ليلة (إجمالي ${totalAmount.toFixed(
    2,
  )} د.أ، متبقي ${remaining.toFixed(2)} د.أ)`;

  const action = await prisma.assistantAction.create({
    data: {
      conversationId: ctx.conversationId,
      kind: "reservation_create",
      summary,
      payload: {
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        guestName,
        phone: input.phone?.trim() || null,
        numNights,
        checkIn: checkIn.toISOString(),
        checkOut: checkOut.toISOString(),
        unitPrice,
        totalAmount,
        paidAmount,
        remaining,
        paymentMethod: input.paymentMethod ?? null,
        numGuests: Number.isInteger(input.numGuests) && input.numGuests! > 0 ? input.numGuests : 1,
        notes: input.notes?.trim() || null,
      },
      status: "pending",
      expiresAt,
    },
  });

  return ok({
    actionId: action.id,
    kind: "reservation_create",
    summary,
    expiresAt: expiresAt.toISOString(),
  });
}
