import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ForbiddenError, requirePermission, hasPermission } from "@/lib/permissions/guard";
import {
  ACCOUNT_CODES,
  AccountingError,
  cashAccountCodeFromMethod,
  postEntry,
} from "@/lib/accounting";
import { applyChangeOperation, findChangeOperation } from "./control/registry";

/**
 * Executor — translates a confirmed `AssistantAction` row into a real
 * write against the matching domain. Defence-in-depth permission check
 * runs again here even though the engine already filters tools, in case
 * the user's role was downgraded between proposal and confirmation, or
 * a stale draft is being confirmed.
 */

export interface ExecuteResult {
  ok: boolean;
  /** Stringified id of the created row (e.g. journalEntry.id) — null when ok=false. */
  refId?: string | null;
  /** Human-readable result for the staff. */
  message: string;
  errorCode?: "forbidden" | "expired" | "invalid_state" | "validation" | "internal" | "not_found";
}

export async function executeAssistantAction(
  actionId: number,
  userId: number,
): Promise<ExecuteResult> {
  const action = await prisma.assistantAction.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      conversationId: true,
      kind: true,
      status: true,
      payload: true,
      summary: true,
      expiresAt: true,
      conversation: { select: { userId: true } },
    },
  });
  if (!action) {
    return { ok: false, message: "المسودة غير موجودة", errorCode: "not_found" };
  }
  if (action.conversation.userId !== userId) {
    return { ok: false, message: "هذه المسودة لا تخصّك", errorCode: "forbidden" };
  }
  if (action.status !== "pending") {
    return {
      ok: false,
      message: `لا يمكن تنفيذ مسودة بحالة "${action.status}"`,
      errorCode: "invalid_state",
    };
  }
  if (action.expiresAt.getTime() < Date.now()) {
    await prisma.assistantAction.update({
      where: { id: action.id },
      data: { status: "expired" },
    });
    return { ok: false, message: "انتهت صلاحية المسودة. اطلب من المساعد إنشاءها من جديد.", errorCode: "expired" };
  }

  const requiredKey = permissionForKind(action.kind, action.payload as Record<string, unknown>);
  if (requiredKey) {
    const allowed = await hasPermission(userId, requiredKey);
    if (!allowed) {
      await prisma.assistantAction.update({
        where: { id: action.id },
        data: {
          status: "failed",
          errorMessage: `Forbidden: missing ${requiredKey}`,
          executedById: userId,
          executedAt: new Date(),
        },
      });
      return { ok: false, message: `لا تملك صلاحية تنفيذ هذه العملية (${requiredKey})`, errorCode: "forbidden" };
    }
  }

  // Mark confirmed first so concurrent confirmations don't double-execute.
  const confirmed = await prisma.assistantAction.updateMany({
    where: { id: action.id, status: "pending" },
    data: { status: "confirmed", confirmedAt: new Date(), executedById: userId },
  });
  if (confirmed.count === 0) {
    return { ok: false, message: "تم تأكيد هذه المسودة من جلسة أخرى", errorCode: "invalid_state" };
  }

  try {
    const result = await dispatchByKind(action.kind, action.payload as Record<string, unknown>, userId);
    await prisma.assistantAction.update({
      where: { id: action.id },
      data: {
        status: "executed",
        executedAt: new Date(),
        executedRefId: result.refId ?? null,
      },
    });
    return { ok: true, refId: result.refId ?? null, message: result.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal error";
    await prisma.assistantAction.update({
      where: { id: action.id },
      data: { status: "failed", errorMessage: msg },
    });
    if (e instanceof ForbiddenError) {
      return { ok: false, message: e.message, errorCode: "forbidden" };
    }
    if (e instanceof AccountingError) {
      return { ok: false, message: e.message, errorCode: "validation" };
    }
    console.error("[assistant/executor]", e);
    return { ok: false, message: msg, errorCode: "internal" };
  }
}

export async function rejectAssistantAction(
  actionId: number,
  userId: number,
): Promise<ExecuteResult> {
  const action = await prisma.assistantAction.findUnique({
    where: { id: actionId },
    select: { id: true, status: true, conversation: { select: { userId: true } } },
  });
  if (!action) return { ok: false, message: "المسودة غير موجودة", errorCode: "not_found" };
  if (action.conversation.userId !== userId)
    return { ok: false, message: "هذه المسودة لا تخصّك", errorCode: "forbidden" };
  if (action.status !== "pending")
    return { ok: false, message: `لا يمكن إلغاء مسودة بحالة "${action.status}"`, errorCode: "invalid_state" };

  await prisma.assistantAction.update({
    where: { id: action.id },
    data: { status: "rejected", executedById: userId, executedAt: new Date() },
  });
  return { ok: true, message: "تم إلغاء المسودة." };
}

// ─────────────────────── dispatch by kind ───────────────────────

function permissionForKind(kind: string, payload?: Record<string, unknown>): string | null {
  switch (kind) {
    case "journal_entry":
      return "accounting.journal:create";
    case "reservation_create":
      return "reservations:create";
    case "maintenance_create":
      return "maintenance:create";
    case "task_create":
      return "tasks.cards:create";
    case "payroll_advance":
      return "accounting.parties:advance";
    case "unit_status_change":
      return "rooms:edit";
    case "generic_change": {
      // Resolve from the registry so the gate matches what the tool used.
      const target = (payload?.target as string | undefined) ?? "";
      const op = (payload?.operation as string | undefined) ?? "";
      const found = findChangeOperation(target, op);
      return found ? found.permission : null;
    }
    default:
      return null;
  }
}

async function dispatchByKind(
  kind: string,
  payload: Record<string, unknown>,
  userId: number,
): Promise<{ refId: string | null; message: string }> {
  switch (kind) {
    case "journal_entry":
      return executeJournalEntry(payload, userId);
    case "reservation_create":
      return executeReservationCreate(payload, userId);
    case "maintenance_create":
      return executeMaintenanceCreate(payload, userId);
    case "task_create":
      return executeTaskCreate(payload, userId);
    case "payroll_advance":
      return executePayrollAdvance(payload, userId);
    case "unit_status_change":
      return executeUnitStatusChange(payload, userId);
    case "generic_change":
      return executeGenericChange(payload, userId);
    default:
      throw new Error(`نوع غير مدعوم: ${kind}`);
  }
}

/**
 * Confirm-side dispatcher for the generic propose-anything flow. The
 * payload was validated when the action was created, but we re-run
 * `validate()` here to catch the case where the WRITABLE_RESOURCES
 * registry shrank (an admin removed an op) between propose and confirm.
 */
async function executeGenericChange(payload: Record<string, unknown>, userId: number) {
  const target = String(payload?.target ?? "");
  const operation = String(payload?.operation ?? "");
  const targetIdRaw = payload?.targetId;
  const targetId =
    targetIdRaw == null
      ? null
      : Number.isInteger(Number(targetIdRaw)) && Number(targetIdRaw) > 0
        ? Number(targetIdRaw)
        : null;
  const data = (payload?.data && typeof payload.data === "object"
    ? (payload.data as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const op = findChangeOperation(target, operation);
  if (!op) {
    throw new Error(`عملية غير معروفة: ${target}.${operation}`);
  }
  if (op.needsTargetId && targetId == null) {
    throw new Error(`العملية ${target}.${operation} تحتاج targetId.`);
  }

  // Re-validate at confirm-time — payloads are user-supplied JSON.
  const validated = op.validate(data);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  return applyChangeOperation(target, operation, targetId, validated.data, userId);
}

async function executeUnitStatusChange(payload: Record<string, unknown>, _userId: number) {
  const unitId = Number(payload.unitId);
  const toStatus = String(payload.toStatus ?? "");
  if (!["available", "occupied", "maintenance"].includes(toStatus)) {
    throw new Error(`حالة غير صالحة: ${toStatus}`);
  }
  const updated = await prisma.unit.update({
    where: { id: unitId },
    data: { status: toStatus },
    select: { id: true, unitNumber: true, status: true },
  });
  return {
    refId: String(updated.id),
    message: `تم تحديث حالة الوحدة ${updated.unitNumber} إلى "${updated.status}".`,
  };
}

interface JournalLinePayload {
  accountCode: string;
  partyId?: number | null;
  costCenterCode?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
}

async function executeJournalEntry(payload: Record<string, unknown>, userId: number) {
  const date = String(payload.date ?? "");
  const description = String(payload.description ?? "");
  const reference = (payload.reference as string | null) ?? null;
  const lines = (payload.lines as JournalLinePayload[]) ?? [];

  const entry = await prisma.$transaction(async (tx) => {
    return postEntry(tx, {
      date: new Date(date + "T00:00:00.000Z"),
      description,
      reference,
      source: "assistant",
      createdById: userId,
      lines: lines.map((l) => ({
        accountCode: l.accountCode,
        partyId: l.partyId ?? null,
        costCenterCode: l.costCenterCode ?? null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description ?? null,
      })),
    });
  });

  return {
    refId: String(entry.id),
    message: `تم ترحيل القيد ${entry.entryNumber} بنجاح.`,
  };
}

async function executeReservationCreate(payload: Record<string, unknown>, userId: number) {
  const unitId = Number(payload.unitId);
  const guestName = String(payload.guestName ?? "");
  const phone = (payload.phone as string | null) ?? null;
  const numNights = Number(payload.numNights);
  const checkIn = new Date(String(payload.checkIn));
  const checkOut = new Date(String(payload.checkOut));
  const unitPrice = Number(payload.unitPrice);
  const totalAmount = Number(payload.totalAmount);
  const paidAmount = Number(payload.paidAmount) || 0;
  const remaining = +(totalAmount - paidAmount).toFixed(2);
  const paymentMethod = (payload.paymentMethod as string | null) ?? null;
  const numGuests = Number(payload.numGuests) || 1;
  const notes = (payload.notes as string | null) ?? null;

  const created = await prisma.$transaction(async (tx) => {
    // Re-check overlap in the txn so we don't race the executor.
    const conflict = await tx.reservation.findFirst({
      where: {
        unitId,
        status: { in: ["active", "pending"] },
        AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
      },
      select: { id: true, guestName: true },
    });
    if (conflict) {
      throw new Error(`تتعارض الفترة مع الحجز #${conflict.id} - ${conflict.guestName}`);
    }
    const res = await tx.reservation.create({
      data: {
        unitId,
        guestName,
        phone,
        numNights,
        stayType: "daily",
        checkIn,
        checkOut,
        unitPrice,
        totalAmount,
        paidAmount,
        remaining,
        paymentMethod,
        numGuests,
        notes,
        status: "active",
        source: "staff",
      },
      select: { id: true, unit: { select: { unitNumber: true } } },
    });

    if (paidAmount > 0) {
      await postEntry(tx, {
        date: new Date(),
        description: `حجز - ${guestName} - وحدة ${res.unit?.unitNumber ?? "?"}`,
        reference: `RES-${res.id}`,
        source: "reservation",
        sourceRefId: res.id,
        createdById: userId,
        lines: [
          { accountCode: cashAccountCodeFromMethod(paymentMethod), debit: paidAmount },
          { accountCode: ACCOUNT_CODES.REVENUE_ROOMS, credit: paidAmount },
        ],
      });
    }
    return res;
  });

  return {
    refId: String(created.id),
    message: `تم إنشاء الحجز #${created.id} بنجاح.`,
  };
}

async function executeMaintenanceCreate(payload: Record<string, unknown>, _userId: number) {
  const created = await prisma.maintenance.create({
    data: {
      unitId: Number(payload.unitId),
      description: String(payload.description ?? ""),
      contractor: (payload.contractor as string | null) ?? null,
      cost: Number(payload.cost) || 0,
      notes: (payload.notes as string | null) ?? null,
      status: "pending",
    },
    select: { id: true },
  });
  return {
    refId: String(created.id),
    message: `تم تسجيل طلب الصيانة #${created.id} بنجاح.`,
  };
}

async function executeTaskCreate(payload: Record<string, unknown>, userId: number) {
  const boardId = Number(payload.boardId);
  const title = String(payload.title ?? "");
  const description = (payload.description as string | null) ?? null;
  const priority = String(payload.priority ?? "med");
  const dueAt = payload.dueAt ? new Date(String(payload.dueAt)) : null;
  const assigneeUserIds = Array.isArray(payload.assigneeUserIds)
    ? (payload.assigneeUserIds as number[])
    : [];

  const firstColumn = await prisma.taskColumn.findFirst({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!firstColumn) {
    throw new Error("اللوحة لا تحتوي على أعمدة. أضف عموداً قبل إنشاء بطاقات.");
  }
  const tail = await prisma.task.aggregate({
    where: { columnId: firstColumn.id },
    _max: { position: true },
  });
  const position = (tail._max.position ?? 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        boardId,
        columnId: firstColumn.id,
        title,
        description,
        priority,
        dueAt,
        position,
        createdById: userId,
      },
      select: { id: true },
    });
    if (assigneeUserIds.length > 0) {
      await tx.taskAssignee.createMany({
        data: assigneeUserIds.map((uid) => ({ taskId: task.id, userId: uid })),
        skipDuplicates: true,
      });
    }
    return task;
  });

  return { refId: String(created.id), message: `تم إنشاء المهمة #${created.id} بنجاح.` };
}

async function executePayrollAdvance(payload: Record<string, unknown>, userId: number) {
  const partyId = Number(payload.partyId);
  const amount = Number(payload.amount);
  const paymentMethod = (payload.paymentMethod as string | null) ?? "cash";
  const date = String(payload.date ?? new Date().toISOString().slice(0, 10));
  const notes = (payload.notes as string | null) ?? null;

  const employee = await prisma.party.findUnique({
    where: { id: partyId },
    select: { id: true, name: true, type: true },
  });
  if (!employee) throw new Error("الموظف غير موجود.");
  if (employee.type !== "employee") throw new Error("الطرف ليس موظفاً.");

  // Advance = الموظف مدين علينا (سُلفة) ، الصندوق دائن.
  const entry = await prisma.$transaction(async (tx) => {
    return postEntry(tx, {
      date: new Date(date + "T00:00:00.000Z"),
      description: `سلفة موظف - ${employee.name}${notes ? " - " + notes : ""}`,
      reference: null,
      source: "advance",
      createdById: userId,
      lines: [
        {
          accountCode: ACCOUNT_CODES.AP_EMPLOYEES,
          partyId: employee.id,
          debit: amount,
          description: `سلفة - ${employee.name}`,
        },
        {
          accountCode: cashAccountCodeFromMethod(paymentMethod),
          credit: amount,
          description: `صرف سلفة - ${employee.name}`,
        },
      ],
    });
  });

  return { refId: String(entry.id), message: `تم تسجيل السلفة عبر القيد ${entry.entryNumber}.` };
}

// Re-export so the engine can re-use the permission helper if needed.
export { requirePermission };
// Suppress unused decimal import warning when Prisma decimals aren't used here.
export type { Prisma };
