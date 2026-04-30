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

export interface ProposeTaskCardInput {
  boardId: number;
  title: string;
  description?: string | null;
  priority?: "low" | "med" | "high" | "urgent" | null;
  dueAt?: string | null;
  assigneeUserIds?: number[] | null;
}

export const proposeTaskCardSchema: ToolJsonSchema = {
  name: "proposeTaskCard",
  description:
    "اقترح إنشاء بطاقة مهمة في إحدى لوحات المهام. الموظف يؤكد قبل الإنشاء الفعلي.",
  parameters: {
    type: "object",
    properties: {
      boardId: { type: "integer", description: "رقم اللوحة المستهدفة." },
      title: { type: "string", description: "عنوان البطاقة." },
      description: { type: ["string", "null"], description: "وصف تفصيلي." },
      priority: {
        type: ["string", "null"],
        enum: ["low", "med", "high", "urgent", null],
        description: "أولوية المهمة.",
      },
      dueAt: {
        type: ["string", "null"],
        description: "موعد الاستحقاق ISO 8601 (مثال 2026-05-01T15:00:00Z).",
      },
      assigneeUserIds: {
        type: ["array", "null"],
        items: { type: "integer" },
        description: "معرّفات الموظفين المُسنَدين.",
      },
    },
    required: ["boardId", "title", "description", "priority", "dueAt", "assigneeUserIds"],
    additionalProperties: false,
  },
};

export async function proposeTaskCard(
  input: ProposeTaskCardInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ProposedActionPayload>> {
  if (!Number.isInteger(input?.boardId) || input.boardId <= 0)
    return err({ code: "bad_input", message: "boardId غير صالح", field: "boardId" });
  const title = (input?.title ?? "").trim();
  if (!title) return err({ code: "bad_input", message: "عنوان المهمة مطلوب", field: "title" });

  const board = await prisma.taskBoard.findUnique({
    where: { id: input.boardId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!board || board.archivedAt) return err({ code: "not_found", message: "اللوحة غير موجودة أو مؤرشفة" });

  let dueAtIso: string | null = null;
  if (input.dueAt) {
    const dt = new Date(input.dueAt);
    if (Number.isNaN(dt.getTime())) {
      return err({ code: "bad_input", message: "dueAt بصيغة غير صالحة", field: "dueAt" });
    }
    dueAtIso = dt.toISOString();
  }

  const expiresAt = new Date(ctx.now.getTime() + 30 * 60 * 1000);
  const summary = `مهمة جديدة في لوحة "${board.name}": ${title}`;

  const action = await prisma.assistantAction.create({
    data: {
      conversationId: ctx.conversationId,
      kind: "task_create",
      summary,
      payload: {
        boardId: board.id,
        boardName: board.name,
        title,
        description: input.description?.trim() || null,
        priority: input.priority ?? "med",
        dueAt: dueAtIso,
        assigneeUserIds: Array.isArray(input.assigneeUserIds) ? input.assigneeUserIds : [],
      },
      status: "pending",
      expiresAt,
    },
  });

  return ok({
    actionId: action.id,
    kind: "task_create",
    summary,
    expiresAt: expiresAt.toISOString(),
  });
}
