import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// WRITABLE_RESOURCES — single source of truth for the generic
// `proposeChange` tool. Every entry below adds one (target, operation)
// pair the assistant can propose. The pair carries:
//
//   • permission   — gating string from the central permissions registry.
//                    A staff member without it never sees the operation
//                    in the system prompt and the executor double-checks
//                    on confirm.
//   • describe     — short Arabic blurb the model reads to know WHEN to
//                    pick this op + which fields belong in `data`.
//   • validate     — pure function returning a sanitised payload or an
//                    error message. Runs at propose-time AND confirm-time
//                    (defence in depth).
//   • summarise    — Arabic one-liner for the confirmation card.
//   • apply        — performs the actual write inside a Prisma txn,
//                    returns { refId, message }.
//
// Adding a new operation = append one entry. No engine, prompt, or tool
// schema change required.
// ---------------------------------------------------------------------------

export type ChangeOperation = {
  description: string;
  permission: string;
  /** Whether `targetId` is required (true for update/delete, false for create). */
  needsTargetId: boolean;
  /** Validate + normalise the model's `data` payload. */
  validate(data: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; error: string };
  /** Render an Arabic single-line summary for the confirmation card. */
  summarise(data: Record<string, unknown>, targetId: number | null): string;
  /** Execute the change; called by the executor after confirm. */
  apply(
    tx: Prisma.TransactionClient,
    targetId: number | null,
    data: Record<string, unknown>,
    userId: number,
  ): Promise<{ refId: string | null; message: string }>;
};

export type ChangeTarget = {
  /** Arabic label shown in describe() output. */
  label: string;
  operations: Record<string, ChangeOperation>;
};

// ─────────────────────── helpers ───────────────────────

function asStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  return null;
}
function asPositiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n : null;
}
function asNonNegativeNumber(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ─────────────────────── operations ───────────────────────

const taskUpdate: ChangeOperation = {
  description:
    "تعديل بيانات بطاقة مهمّة موجودة: العنوان (title), الوصف (description), الأولوية (priority ∈ low|med|high|urgent), تاريخ الاستحقاق (dueAt ISO أو null لإزالته). targetId = id البطاقة.",
  permission: "tasks.cards:edit",
  needsTargetId: true,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("title" in d) {
      const v = asStringOrNull(d.title);
      if (!v) return { ok: false, error: "العنوان لا يمكن أن يكون فارغاً" };
      out.title = v.slice(0, 200);
    }
    if ("description" in d) out.description = asStringOrNull(d.description);
    if ("priority" in d) {
      const v = asStringOrNull(d.priority);
      if (!v || !["low", "med", "high", "urgent"].includes(v)) {
        return { ok: false, error: "أولوية غير معروفة" };
      }
      out.priority = v;
    }
    if ("dueAt" in d) {
      if (d.dueAt === null) out.dueAt = null;
      else {
        const t = asStringOrNull(d.dueAt);
        if (!t) return { ok: false, error: "dueAt يجب أن يكون ISO date أو null" };
        const dt = new Date(t);
        if (Number.isNaN(dt.getTime())) return { ok: false, error: "dueAt تاريخ غير صالح" };
        out.dueAt = dt.toISOString();
      }
    }
    if (Object.keys(out).length === 0) return { ok: false, error: "لا توجد حقول للتحديث" };
    return { ok: true, data: out };
  },
  summarise(data, targetId) {
    const fields = Object.keys(data).join("، ");
    return `تعديل بطاقة المهمّة #${targetId} (${fields}).`;
  },
  async apply(tx, targetId, data) {
    if (targetId == null) throw new Error("targetId مفقود");
    const updateData: Record<string, unknown> = { ...data };
    if (typeof updateData.dueAt === "string") {
      updateData.dueAt = new Date(updateData.dueAt as string);
    }
    const t = await tx.task.update({ where: { id: targetId }, data: updateData, select: { id: true, title: true } });
    return { refId: String(t.id), message: `تم تحديث بطاقة المهمّة "${t.title}".` };
  },
};

const taskDelete: ChangeOperation = {
  description: "حذف بطاقة مهمّة. targetId = id البطاقة.",
  permission: "tasks.cards:delete",
  needsTargetId: true,
  validate() {
    return { ok: true, data: {} };
  },
  summarise(_d, targetId) {
    return `حذف بطاقة المهمّة #${targetId}.`;
  },
  async apply(tx, targetId) {
    if (targetId == null) throw new Error("targetId مفقود");
    await tx.task.delete({ where: { id: targetId } });
    return { refId: String(targetId), message: `تم حذف البطاقة #${targetId}.` };
  },
};

const maintenanceUpdate: ChangeOperation = {
  description:
    "تحديث طلب صيانة موجود: status ∈ pending|in_progress|completed، contractor (اسم الفنّي)، cost (التكلفة بالدينار)، notes، completionDate (ISO عند إغلاق). targetId = id طلب الصيانة. لا تستعمل هذه العملية لإنشاء طلب جديد — استعمل proposeMaintenanceRequest.",
  permission: "maintenance:edit",
  needsTargetId: true,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("status" in d) {
      const v = asStringOrNull(d.status);
      if (!v || !["pending", "in_progress", "completed"].includes(v)) {
        return { ok: false, error: "حالة غير معروفة" };
      }
      out.status = v;
    }
    if ("contractor" in d) out.contractor = asStringOrNull(d.contractor);
    if ("cost" in d) {
      const n = asNonNegativeNumber(d.cost);
      if (n == null) return { ok: false, error: "cost يجب أن يكون رقماً غير سالب" };
      out.cost = n;
    }
    if ("notes" in d) out.notes = asStringOrNull(d.notes);
    if ("completionDate" in d) {
      if (d.completionDate === null) out.completionDate = null;
      else {
        const t = asStringOrNull(d.completionDate);
        if (!t) return { ok: false, error: "completionDate يجب أن يكون ISO date أو null" };
        const dt = new Date(t);
        if (Number.isNaN(dt.getTime())) return { ok: false, error: "completionDate تاريخ غير صالح" };
        out.completionDate = dt.toISOString();
      }
    }
    if (Object.keys(out).length === 0) return { ok: false, error: "لا توجد حقول للتحديث" };
    return { ok: true, data: out };
  },
  summarise(data, targetId) {
    const fields = Object.keys(data).join("، ");
    return `تحديث طلب الصيانة #${targetId} (${fields}).`;
  },
  async apply(tx, targetId, data) {
    if (targetId == null) throw new Error("targetId مفقود");
    const updateData: Record<string, unknown> = { ...data };
    if (typeof updateData.completionDate === "string") {
      updateData.completionDate = new Date(updateData.completionDate as string);
    }
    const m = await tx.maintenance.update({
      where: { id: targetId },
      data: updateData,
      select: { id: true, unit: { select: { unitNumber: true } } },
    });
    return {
      refId: String(m.id),
      message: `تم تحديث طلب الصيانة #${m.id} (الوحدة ${m.unit?.unitNumber ?? "?"}).`,
    };
  },
};

const partyUpdate: ChangeOperation = {
  description:
    "تحديث بيانات طرف محاسبي (موظف/شريك/مورد/عميل/مقرض): name, phone, email, notes, isActive. لا تغيّر `type` — نوع الطرف يحدّد بنية الحسابات الجارية ولا يجوز تغييره من هنا. targetId = id الطرف.",
  permission: "accounting.parties:edit",
  needsTargetId: true,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("name" in d) {
      const v = asStringOrNull(d.name);
      if (!v) return { ok: false, error: "الاسم لا يمكن أن يكون فارغاً" };
      out.name = v.slice(0, 200);
    }
    if ("phone" in d) out.phone = asStringOrNull(d.phone);
    if ("email" in d) out.email = asStringOrNull(d.email);
    if ("notes" in d) out.notes = asStringOrNull(d.notes);
    if ("isActive" in d) {
      if (typeof d.isActive !== "boolean") return { ok: false, error: "isActive يجب أن يكون true/false" };
      out.isActive = d.isActive;
    }
    if (Object.keys(out).length === 0) return { ok: false, error: "لا توجد حقول للتحديث" };
    return { ok: true, data: out };
  },
  summarise(data, targetId) {
    const fields = Object.keys(data).join("، ");
    return `تعديل بيانات الطرف #${targetId} (${fields}).`;
  },
  async apply(tx, targetId, data) {
    if (targetId == null) throw new Error("targetId مفقود");
    const p = await tx.party.update({
      where: { id: targetId },
      data,
      select: { id: true, name: true },
    });
    return { refId: String(p.id), message: `تم تحديث بيانات "${p.name}".` };
  },
};

const reservationUpdateNotes: ChangeOperation = {
  description:
    "تحديث الملاحظات الحرّة (notes) لحجز موجود فقط. لتعديل البيانات المالية أو حالات الحجز استعمل أدوات متخصّصة. targetId = id الحجز.",
  permission: "reservations:edit",
  needsTargetId: true,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    if (!("notes" in d)) return { ok: false, error: "حقل notes مطلوب" };
    return { ok: true, data: { notes: asStringOrNull(d.notes) } };
  },
  summarise(_d, targetId) {
    return `تحديث ملاحظات الحجز #${targetId}.`;
  },
  async apply(tx, targetId, data) {
    if (targetId == null) throw new Error("targetId مفقود");
    const r = await tx.reservation.update({
      where: { id: targetId },
      data: { notes: (data.notes as string | null) ?? null },
      select: { id: true, guestName: true },
    });
    return { refId: String(r.id), message: `تم تحديث ملاحظات الحجز #${r.id} (${r.guestName}).` };
  },
};

const unitUpdate: ChangeOperation = {
  description:
    "تحديث ميتاداتا الغرفة: notes (ملاحظات حرّة)، unitNumber (رقم العرض). لتغيير الحالة (متاح/صيانة) استعمل proposeUnitStatusChange. targetId = id الوحدة.",
  permission: "rooms:edit",
  needsTargetId: true,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("notes" in d) out.notes = asStringOrNull(d.notes);
    if ("unitNumber" in d) {
      const v = asStringOrNull(d.unitNumber);
      if (!v) return { ok: false, error: "unitNumber لا يمكن أن يكون فارغاً" };
      out.unitNumber = v.slice(0, 30);
    }
    if (Object.keys(out).length === 0) return { ok: false, error: "لا توجد حقول للتحديث" };
    return { ok: true, data: out };
  },
  summarise(data, targetId) {
    const fields = Object.keys(data).join("، ");
    return `تحديث الوحدة #${targetId} (${fields}).`;
  },
  async apply(tx, targetId, data) {
    if (targetId == null) throw new Error("targetId مفقود");
    const u = await tx.unit.update({
      where: { id: targetId },
      data,
      select: { id: true, unitNumber: true },
    });
    return { refId: String(u.id), message: `تم تحديث الوحدة ${u.unitNumber}.` };
  },
};

const costCenterCreate: ChangeOperation = {
  description:
    "إنشاء مركز تكلفة جديد. data = {code, name, description?}. الحقل code فريد ويستعمل لاحقاً في القيود.",
  permission: "accounting.cost-centers:create",
  needsTargetId: false,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    const code = asStringOrNull(d.code);
    const name = asStringOrNull(d.name);
    if (!code) return { ok: false, error: "code مطلوب" };
    if (!name) return { ok: false, error: "name مطلوب" };
    return {
      ok: true,
      data: {
        code: code.slice(0, 30),
        name: name.slice(0, 200),
        description: asStringOrNull(d.description),
      },
    };
  },
  summarise(data) {
    return `إنشاء مركز تكلفة جديد بالكود ${data.code} (${data.name}).`;
  },
  async apply(tx, _targetId, data) {
    const c = await tx.costCenter.create({
      data: {
        code: data.code as string,
        name: data.name as string,
        description: (data.description as string | null) ?? null,
      },
      select: { id: true, code: true, name: true },
    });
    return { refId: String(c.id), message: `تم إنشاء مركز التكلفة ${c.code} - ${c.name}.` };
  },
};

const costCenterUpdate: ChangeOperation = {
  description: "تحديث مركز تكلفة موجود: name, description, isActive. targetId = id مركز التكلفة.",
  permission: "accounting.cost-centers:edit",
  needsTargetId: true,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("name" in d) {
      const v = asStringOrNull(d.name);
      if (!v) return { ok: false, error: "الاسم لا يمكن أن يكون فارغاً" };
      out.name = v.slice(0, 200);
    }
    if ("description" in d) out.description = asStringOrNull(d.description);
    if ("isActive" in d) {
      if (typeof d.isActive !== "boolean") return { ok: false, error: "isActive يجب أن يكون true/false" };
      out.isActive = d.isActive;
    }
    if (Object.keys(out).length === 0) return { ok: false, error: "لا توجد حقول للتحديث" };
    return { ok: true, data: out };
  },
  summarise(_d, targetId) {
    return `تحديث مركز التكلفة #${targetId}.`;
  },
  async apply(tx, targetId, data) {
    if (targetId == null) throw new Error("targetId مفقود");
    const c = await tx.costCenter.update({
      where: { id: targetId },
      data,
      select: { id: true, code: true, name: true },
    });
    return { refId: String(c.id), message: `تم تحديث مركز التكلفة ${c.code} - ${c.name}.` };
  },
};

const accountUpdate: ChangeOperation = {
  description:
    "تحديث حساب موجود في شجرة الحسابات: name, description, isActive. لا تغيّر type أو parentId من هنا — هذه تغييرات بنيوية تحتاج /api/accounting/accounts. targetId = id الحساب.",
  permission: "accounting.accounts:edit",
  needsTargetId: true,
  validate(input) {
    const d = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if ("name" in d) {
      const v = asStringOrNull(d.name);
      if (!v) return { ok: false, error: "الاسم لا يمكن أن يكون فارغاً" };
      out.name = v.slice(0, 200);
    }
    if ("description" in d) out.description = asStringOrNull(d.description);
    if ("isActive" in d) {
      if (typeof d.isActive !== "boolean") return { ok: false, error: "isActive يجب أن يكون true/false" };
      out.isActive = d.isActive;
    }
    if (Object.keys(out).length === 0) return { ok: false, error: "لا توجد حقول للتحديث" };
    return { ok: true, data: out };
  },
  summarise(_d, targetId) {
    return `تحديث الحساب #${targetId}.`;
  },
  async apply(tx, targetId, data) {
    if (targetId == null) throw new Error("targetId مفقود");
    const a = await tx.account.update({
      where: { id: targetId },
      data,
      select: { id: true, code: true, name: true },
    });
    return { refId: String(a.id), message: `تم تحديث الحساب ${a.code} - ${a.name}.` };
  },
};

// ─────────────────────── registry ───────────────────────

export const WRITABLE_RESOURCES: Record<string, ChangeTarget> = {
  task: {
    label: "بطاقة مهمّة",
    operations: {
      update: taskUpdate,
      delete: taskDelete,
    },
  },
  maintenance: {
    label: "طلب صيانة",
    operations: {
      update: maintenanceUpdate,
    },
  },
  party: {
    label: "طرف محاسبي",
    operations: {
      update: partyUpdate,
    },
  },
  reservation: {
    label: "حجز",
    operations: {
      update_notes: reservationUpdateNotes,
    },
  },
  unit: {
    label: "وحدة سكنية",
    operations: {
      update: unitUpdate,
    },
  },
  cost_center: {
    label: "مركز تكلفة",
    operations: {
      create: costCenterCreate,
      update: costCenterUpdate,
    },
  },
  account: {
    label: "حساب محاسبي",
    operations: {
      update: accountUpdate,
    },
  },
};

/** Return the operation if (target, operation) is registered, else null. */
export function findChangeOperation(target: string, op: string): ChangeOperation | null {
  const t = WRITABLE_RESOURCES[target];
  if (!t) return null;
  return t.operations[op] ?? null;
}

/**
 * Build a markdown-ish catalogue listing ONLY the (target, operation) pairs
 * the current user is permitted to invoke. This is dropped into the system
 * prompt as the model's reference manual for `proposeChange`. Other targets
 * remain invisible so the model can't hallucinate calls it doesn't have
 * permission for.
 */
export function buildPermittedChangeCatalogue(permissions: ReadonlySet<string>): string {
  const lines: string[] = [];
  for (const [targetKey, target] of Object.entries(WRITABLE_RESOURCES)) {
    const allowedOps = Object.entries(target.operations).filter(([, op]) =>
      permissions.has(op.permission),
    );
    if (allowedOps.length === 0) continue;
    lines.push(`- ${targetKey} (${target.label}):`);
    for (const [opKey, op] of allowedOps) {
      lines.push(
        `  • ${opKey}${op.needsTargetId ? " (يحتاج targetId)" : ""}: ${op.description}`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Snapshot of the current registry's keys — used by the JSON-schema's
 * `target` enum. We keep it in code (not at request time) so the schema
 * is stable across requests and can be validated by strict-tools mode.
 */
export const ALL_CHANGE_TARGETS = Object.keys(WRITABLE_RESOURCES);

/** Internal — used by both the tool and the executor to check permission. */
export async function hasOperationPermission(
  permissions: ReadonlySet<string>,
  target: string,
  op: string,
): Promise<boolean> {
  const found = findChangeOperation(target, op);
  if (!found) return false;
  return permissions.has(found.permission);
}

/** Run an operation inside a Prisma txn; called by the executor. */
export async function applyChangeOperation(
  target: string,
  op: string,
  targetId: number | null,
  data: Record<string, unknown>,
  userId: number,
): Promise<{ refId: string | null; message: string }> {
  const operation = findChangeOperation(target, op);
  if (!operation) throw new Error(`عملية غير معروفة: ${target}.${op}`);
  return prisma.$transaction((tx) => operation.apply(tx, targetId, data, userId));
}
