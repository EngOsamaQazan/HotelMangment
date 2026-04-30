import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ToolJsonSchema } from "@/lib/llm/types";
import {
  err,
  ok,
  type AssistantToolContext,
  type AssistantToolResult,
  type ProposedActionPayload,
} from "../types";
import {
  ALL_CHANGE_TARGETS,
  findChangeOperation,
  hasOperationPermission,
} from "../control/registry";

// ---------------------------------------------------------------------------
// proposeChange — the "everything" propose tool. Combined with the
// WRITABLE_RESOURCES registry, this single tool gives the assistant
// staffwide CRUD-like authority on the explicit set of (target,operation)
// pairs the admin has wired up — without bloating the tool schema list.
//
// Mental model: searchX/getY collect data → proposeChange asks for the
// human's confirmation → executor (kind="generic_change") commits it.
// ---------------------------------------------------------------------------

export interface ProposeChangeInput {
  target: string;
  operation: string;
  /** Required when the operation is an update/delete; null for creates. */
  targetId?: number | null;
  /**
   * JSON-encoded string payload — the model serialises the per-operation
   * payload as a JSON object string and we parse it here. We can't use a
   * raw object because OpenAI's `strict: true` mode forbids open-ended
   * objects (every property must be enumerated and additionalProperties
   * must be false). String-encoding is the standard workaround.
   */
  data: string;
  /** Optional Arabic one-liner the model would rather we use verbatim. */
  summary?: string | null;
}

export const proposeChangeSchema: ToolJsonSchema = {
  name: "proposeChange",
  description:
    "اقترح أي تعديل عام على النظام (تحديث/حذف/إنشاء) ضمن قائمة الموارد القابلة للتعديل. الأداة تُنشئ مسودة تحتاج تأكيد الموظف قبل التنفيذ. اقرأ \"دليل proposeChange\" في برومبت النظام لمعرفة (target, operation) المتاحة لك مع الحقول المطلوبة لكل واحدة. لا تستعمل هذه الأداة لما له أداة propose مخصّصة (مثل proposeJournalEntry, proposeReservation, proposeMaintenanceRequest, proposeTaskCard, proposePayrollAdvance, proposeUnitStatusChange) — تلك أكثر دقّة.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ALL_CHANGE_TARGETS,
        description: "اسم المورد (انظر دليل proposeChange).",
      },
      operation: {
        type: "string",
        description: "اسم العملية على هذا المورد (مثل update / delete / create / update_notes).",
      },
      targetId: {
        type: ["integer", "null"],
        description: "id السجل (مطلوب للعمليات على سجل موجود؛ null للإنشاء).",
      },
      data: {
        type: "string",
        description:
          "حمولة JSON مُسلسَلة كنص (سلسلة JSON صالحة). الحقول تختلف حسب (target, operation) — راجع الدليل. مثال: '{\"notes\":\"تنبيه أمني\"}'.",
      },
      summary: {
        type: ["string", "null"],
        description: "ملخّص عربي قصير اختياري لعرضه على الموظف بدلاً من الافتراضي.",
      },
    },
    required: ["target", "operation", "targetId", "data", "summary"],
    additionalProperties: false,
  },
};

export async function proposeChange(
  input: ProposeChangeInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ProposedActionPayload>> {
  const target = (input?.target ?? "").trim();
  const operation = (input?.operation ?? "").trim();
  if (!target || !operation) {
    return err({ code: "bad_input", message: "target و operation مطلوبان" });
  }

  const opDef = findChangeOperation(target, operation);
  if (!opDef) {
    return err({
      code: "bad_input",
      message: `العملية "${target}.${operation}" غير معروفة. راجع دليل proposeChange في برومبت النظام للقائمة المتاحة.`,
    });
  }

  // Layer 2 of permission gating. (Layer 1 was tool-list filtering at
  // engine startup; layer 3 runs again in the executor at confirm-time.)
  const allowed = await hasOperationPermission(ctx.userPermissions, target, operation);
  if (!allowed) {
    return err({
      code: "forbidden",
      message: `لا تملك صلاحية ${opDef.permission} لتنفيذ ${target}.${operation}.`,
    });
  }

  // targetId rules.
  if (opDef.needsTargetId) {
    if (input.targetId == null || !Number.isInteger(input.targetId) || input.targetId <= 0) {
      return err({
        code: "bad_input",
        message: `العملية ${target}.${operation} تحتاج targetId صحيحاً.`,
        field: "targetId",
      });
    }
  } else if (input.targetId != null && input.targetId !== 0) {
    return err({
      code: "bad_input",
      message: `العملية ${target}.${operation} عملية إنشاء — مرّر targetId=null.`,
      field: "targetId",
    });
  }

  // The schema sends `data` as a JSON-encoded string (strict-mode workaround
  // since OpenAI doesn't allow open-ended objects). Parse it before
  // handing it to the per-operation validator. Empty string → empty object
  // so create operations with no fields still work.
  let parsedData: unknown = {};
  if (typeof input.data === "string") {
    const trimmed = input.data.trim();
    if (trimmed.length > 0) {
      try {
        parsedData = JSON.parse(trimmed);
      } catch {
        return err({
          code: "bad_input",
          message: "حقل data يجب أن يكون JSON صالحاً (سلسلة بصيغة كائن).",
          field: "data",
        });
      }
    }
  } else if (input.data && typeof input.data === "object") {
    // Backwards-compatible: tolerate raw object payloads from internal
    // callers (tests / CLI) that don't go through OpenAI.
    parsedData = input.data;
  }

  // Per-operation payload validation.
  const validated = opDef.validate(parsedData);
  if (!validated.ok) {
    return err({ code: "bad_input", message: validated.error, field: "data" });
  }

  const summary = (input.summary && input.summary.trim()) || opDef.summarise(validated.data, input.targetId ?? null);
  const expiresAt = new Date(ctx.now.getTime() + 30 * 60 * 1000);

  const action = await prisma.assistantAction.create({
    data: {
      conversationId: ctx.conversationId,
      kind: "generic_change",
      summary,
      payload: {
        target,
        operation,
        targetId: input.targetId ?? null,
        data: validated.data as Prisma.InputJsonValue,
        permission: opDef.permission,
      } as Prisma.InputJsonValue,
      status: "pending",
      expiresAt,
    },
  });

  return ok({
    actionId: action.id,
    kind: "generic_change",
    summary,
    expiresAt: expiresAt.toISOString(),
  });
}

export type { ProposedActionPayload };
