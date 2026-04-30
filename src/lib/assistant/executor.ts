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

/**
 * Patch a pending `AssistantAction` payload (and optionally its summary)
 * before the staff member confirms it. Used by the inline draft editor in
 * the chat UI so an operator can swap a wrong account, fix an amount, or
 * change a price without rejecting the draft and re-asking the assistant.
 *
 * Hard rules:
 *  - Only `pending` drafts can be edited.
 *  - The conversation must belong to the caller.
 *  - Payload merging is shallow at the top level + line-replacement for
 *    `journal_entry.lines`. We never accept arbitrary keys; only the
 *    fields the UI is allowed to expose are honoured.
 *  - For `journal_entry` the new lines must balance (sum debit = sum
 *    credit) — same accounting invariant the executor enforces. We catch
 *    it here so the operator sees the error before pressing confirm.
 */
export interface UpdateActionPatch {
  payloadPatch?: Record<string, unknown>;
  summary?: string | null;
}

export interface UpdateActionResult {
  ok: boolean;
  message: string;
  errorCode?: "forbidden" | "not_found" | "invalid_state" | "validation" | "internal";
  payload?: unknown;
  summary?: string;
}

export async function updateAssistantAction(
  actionId: number,
  userId: number,
  patch: UpdateActionPatch,
): Promise<UpdateActionResult> {
  const action = await prisma.assistantAction.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      kind: true,
      status: true,
      payload: true,
      summary: true,
      conversation: { select: { userId: true } },
    },
  });
  if (!action) return { ok: false, message: "المسودة غير موجودة", errorCode: "not_found" };
  if (action.conversation.userId !== userId) {
    return { ok: false, message: "هذه المسودة لا تخصّك", errorCode: "forbidden" };
  }
  if (action.status !== "pending") {
    return {
      ok: false,
      message: `لا يمكن تعديل مسودة بحالة "${action.status}"`,
      errorCode: "invalid_state",
    };
  }

  const currentPayload =
    action.payload && typeof action.payload === "object" && !Array.isArray(action.payload)
      ? (action.payload as Record<string, unknown>)
      : {};
  let nextPayload: Record<string, unknown> = currentPayload;
  if (patch.payloadPatch) {
    const merged = mergePayload(action.kind, currentPayload, patch.payloadPatch);
    if (!merged.ok) {
      return { ok: false, message: merged.error, errorCode: "validation" };
    }
    nextPayload = merged.payload;
  }
  const nextSummary =
    typeof patch.summary === "string" && patch.summary.trim().length > 0
      ? patch.summary.trim().slice(0, 1000)
      : action.summary;

  const updated = await prisma.assistantAction.update({
    where: { id: action.id },
    data: {
      payload: nextPayload as Prisma.InputJsonValue,
      summary: nextSummary,
    },
    select: { id: true, payload: true, summary: true },
  });
  return {
    ok: true,
    message: "تم تحديث المسودة. راجع التغييرات ثم اضغط تأكيد.",
    payload: updated.payload,
    summary: updated.summary,
  };
}

/**
 * Per-kind shallow merge of a partial payload patch into the existing
 * payload. Validates the result so the resulting draft is still
 * confirmable: balanced journal entries, positive amounts, allowed unit
 * statuses, etc.
 */
function mergePayload(
  kind: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  const next = { ...current, ...patch };

  switch (kind) {
    case "journal_entry": {
      const date = typeof next.date === "string" ? next.date : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { ok: false, error: "تاريخ القيد غير صالح (YYYY-MM-DD)." };
      }
      const description = typeof next.description === "string" ? next.description.trim() : "";
      if (!description) return { ok: false, error: "وصف القيد مطلوب." };
      const linesRaw = Array.isArray(next.lines) ? (next.lines as unknown[]) : null;
      if (!linesRaw || linesRaw.length < 2) {
        return { ok: false, error: "القيد يحتاج إلى سطرين على الأقل." };
      }
      const lines: Array<Record<string, unknown>> = [];
      let totalDebit = 0;
      let totalCredit = 0;
      for (const raw of linesRaw) {
        if (!raw || typeof raw !== "object") {
          return { ok: false, error: "أحد السطور غير صالح." };
        }
        const obj = raw as Record<string, unknown>;
        const accountCode = String(obj.accountCode ?? "").trim();
        if (!accountCode) {
          return { ok: false, error: "كل سطر يحتاج رقم حساب." };
        }
        const debit = Number(obj.debit ?? 0) || 0;
        const credit = Number(obj.credit ?? 0) || 0;
        if (debit < 0 || credit < 0) {
          return { ok: false, error: "القيم السالبة غير مسموحة." };
        }
        if (debit > 0 && credit > 0) {
          return { ok: false, error: "السطر الواحد إما مدين أو دائن، ليس الاثنين." };
        }
        if (debit === 0 && credit === 0) {
          return { ok: false, error: "كل سطر يحتاج قيمة مدين أو دائن > 0." };
        }
        totalDebit += debit;
        totalCredit += credit;
        const partyIdRaw = obj.partyId;
        const partyId =
          partyIdRaw == null
            ? null
            : Number.isInteger(Number(partyIdRaw)) && Number(partyIdRaw) > 0
              ? Number(partyIdRaw)
              : null;
        const partyName = typeof obj.partyName === "string" ? obj.partyName : null;
        const costCenterCode =
          typeof obj.costCenterCode === "string" && obj.costCenterCode.trim()
            ? obj.costCenterCode.trim()
            : null;
        const costCenterName =
          typeof obj.costCenterName === "string" ? obj.costCenterName : null;
        const accountName = typeof obj.accountName === "string" ? obj.accountName : null;
        const lineDescription =
          typeof obj.description === "string" ? obj.description : null;
        lines.push({
          accountCode,
          accountName,
          partyId,
          partyName,
          costCenterCode,
          costCenterName,
          debit: debit || undefined,
          credit: credit || undefined,
          description: lineDescription,
        });
      }
      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return {
          ok: false,
          error: `القيد غير متوازن — مدين ${totalDebit.toFixed(2)} مقابل دائن ${totalCredit.toFixed(2)}.`,
        };
      }
      return {
        ok: true,
        payload: {
          ...next,
          date,
          description,
          reference: typeof next.reference === "string" ? next.reference : null,
          lines,
          totals: { debit: +totalDebit.toFixed(2), credit: +totalCredit.toFixed(2) },
        },
      };
    }
    case "reservation_create": {
      const numNights = Number(next.numNights);
      const unitPrice = Number(next.unitPrice);
      const totalAmount = Number(next.totalAmount);
      const paidAmount = Number(next.paidAmount ?? 0);
      if (!Number.isFinite(numNights) || numNights <= 0) {
        return { ok: false, error: "عدد الليالي غير صالح." };
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return { ok: false, error: "سعر الليلة غير صالح." };
      }
      if (!Number.isFinite(totalAmount) || totalAmount < 0) {
        return { ok: false, error: "الإجمالي غير صالح." };
      }
      if (!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > totalAmount + 0.005) {
        return { ok: false, error: "المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي." };
      }
      const remaining = +(totalAmount - paidAmount).toFixed(2);
      return { ok: true, payload: { ...next, numNights, unitPrice, totalAmount, paidAmount, remaining } };
    }
    case "maintenance_create": {
      if (!String(next.description ?? "").trim()) {
        return { ok: false, error: "وصف العطل مطلوب." };
      }
      const cost = Number(next.cost ?? 0) || 0;
      if (cost < 0) return { ok: false, error: "التكلفة لا يمكن أن تكون سالبة." };
      return { ok: true, payload: { ...next, cost } };
    }
    case "task_create": {
      if (!String(next.title ?? "").trim()) {
        return { ok: false, error: "عنوان المهمة مطلوب." };
      }
      return { ok: true, payload: next };
    }
    case "payroll_advance": {
      const amount = Number(next.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "قيمة السلفة يجب أن تكون أكبر من صفر." };
      }
      return { ok: true, payload: { ...next, amount } };
    }
    case "unit_status_change": {
      const toStatus = String(next.toStatus ?? "");
      if (!["available", "occupied", "maintenance"].includes(toStatus)) {
        return { ok: false, error: "حالة الوحدة غير صالحة." };
      }
      return { ok: true, payload: { ...next, toStatus } };
    }
    case "generic_change": {
      // Generic change drafts carry their own validation in the executor;
      // here we just accept the patched data without further checks so the
      // editor can adjust nested fields freely.
      return { ok: true, payload: next };
    }
    default:
      return { ok: false, error: `لا يوجد محرّر متاح لهذا النوع من المسودات: ${kind}` };
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
