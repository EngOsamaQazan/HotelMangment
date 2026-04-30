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

/**
 * Draft a double-entry journal entry. The LLM never posts directly: it
 * always lands here, we validate the lines locally, persist a row in
 * `AssistantAction` with `kind="journal_entry"` and status `pending`, and
 * the executor (after staff confirmation) calls `postEntry()` from
 * `@/lib/accounting`.
 *
 * Validation we do here (mirrors `postEntry()` so we fail fast and the
 * model can self-correct in the same turn instead of bouncing through the
 * confirm endpoint):
 *   • At least 2 lines.
 *   • Each line has exactly one of debit/credit > 0.
 *   • Total debit == total credit (within EPS).
 *   • Every accountCode resolves in the chart of accounts.
 *   • Every partyId / costCenterId, when given, exists.
 */

const EPS = 0.005;
const MAX_LINES = 20;

interface ProposeJournalLine {
  accountCode: string;
  partyId?: number | null;
  costCenterCode?: string | null;
  debit?: number;
  credit?: number;
  description?: string | null;
}

export interface ProposeJournalEntryInput {
  date: string;
  description: string;
  reference?: string | null;
  lines: ProposeJournalLine[];
}

export const proposeJournalEntrySchema: ToolJsonSchema = {
  name: "proposeJournalEntry",
  description:
    "اقترح قيداً محاسبياً مزدوجاً (Debit/Credit) ليتم عرضه على الموظف ويؤكده قبل الترحيل. لا تقم بأي ترحيل مباشر — هذه الأداة تُنشئ مسودة فقط. يجب أن يتساوى مجموع المدين مع مجموع الدائن، وأن يحتوي القيد على سطرين على الأقل.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "تاريخ القيد بصيغة YYYY-MM-DD. استعمل تاريخ اليوم إذا لم يُحدِّد الموظف غير ذلك.",
      },
      description: {
        type: "string",
        description: "وصف عربي مختصر للقيد (مثل: \"دفع أبو زيد 50 د.أ نيابة عن الشريك حسام\").",
      },
      reference: {
        type: ["string", "null"],
        description: "رقم سند مرجعي اختياري (سند قبض، فاتورة، إلخ).",
      },
      lines: {
        type: "array",
        minItems: 2,
        description: "سطور القيد (سطران على الأقل، ومجموع المدين = مجموع الدائن).",
        items: {
          type: "object",
          properties: {
            accountCode: {
              type: "string",
              description: "كود الحساب من نتيجة searchAccount (مثل 1010 للصندوق).",
            },
            partyId: {
              type: ["integer", "null"],
              description: "رقم الطرف (موظف/شريك/مورد) إن وُجد.",
            },
            costCenterCode: {
              type: ["string", "null"],
              description: "كود مركز التكلفة الاختياري.",
            },
            debit: {
              type: ["number", "null"],
              description: "قيمة المدين (موجبة) — أو null إذا كان السطر دائناً.",
            },
            credit: {
              type: ["number", "null"],
              description: "قيمة الدائن (موجبة) — أو null إذا كان السطر مديناً.",
            },
            description: {
              type: ["string", "null"],
              description: "وصف اختياري للسطر.",
            },
          },
          required: ["accountCode", "partyId", "costCenterCode", "debit", "credit", "description"],
          additionalProperties: false,
        },
      },
    },
    required: ["date", "description", "reference", "lines"],
    additionalProperties: false,
  },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function proposeJournalEntry(
  input: ProposeJournalEntryInput,
  ctx: AssistantToolContext,
): Promise<AssistantToolResult<ProposedActionPayload>> {
  const date = input?.date?.trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return err({ code: "bad_input", message: "تاريخ القيد بصيغة YYYY-MM-DD مطلوب", field: "date" });
  }
  const desc = (input?.description ?? "").trim();
  if (!desc) {
    return err({ code: "bad_input", message: "وصف القيد مطلوب", field: "description" });
  }
  if (!Array.isArray(input?.lines) || input.lines.length < 2) {
    return err({ code: "bad_input", message: "القيد يحتاج سطرين على الأقل", field: "lines" });
  }
  if (input.lines.length > MAX_LINES) {
    return err({ code: "bad_input", message: `الحد الأقصى ${MAX_LINES} سطر`, field: "lines" });
  }

  let totalDebit = 0;
  let totalCredit = 0;
  const accountCodes = new Set<string>();
  const partyIds = new Set<number>();
  const costCenterCodes = new Set<string>();

  for (const [idx, line] of input.lines.entries()) {
    const d = round2(Number(line.debit) || 0);
    const c = round2(Number(line.credit) || 0);
    if (d < 0 || c < 0)
      return err({ code: "bad_input", message: `السطر ${idx + 1}: المدين والدائن لا بد أن يكونا موجبين` });
    if (d > 0 && c > 0)
      return err({ code: "bad_input", message: `السطر ${idx + 1}: لا يمكن وجود مدين ودائن في نفس السطر` });
    if (d === 0 && c === 0)
      return err({ code: "bad_input", message: `السطر ${idx + 1}: السطر يحتاج قيمة في المدين أو الدائن` });
    if (!line.accountCode || typeof line.accountCode !== "string")
      return err({ code: "bad_input", message: `السطر ${idx + 1}: accountCode مطلوب` });

    totalDebit += d;
    totalCredit += c;
    accountCodes.add(line.accountCode);
    if (line.partyId != null) partyIds.add(Number(line.partyId));
    if (line.costCenterCode) costCenterCodes.add(line.costCenterCode);
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  if (Math.abs(totalDebit - totalCredit) > EPS) {
    return err({
      code: "unbalanced",
      message: `القيد غير متوازن: مدين=${totalDebit}، دائن=${totalCredit}. أعد المحاولة بأرقام متوازنة.`,
    });
  }

  // Verify chart of accounts coverage AND fetch human-readable names so the
  // confirmation card can render them inline (the model only sees codes).
  const accounts = await prisma.account.findMany({
    where: { code: { in: Array.from(accountCodes) }, isActive: true },
    select: { code: true, name: true },
  });
  const accountNameByCode = new Map(accounts.map((a) => [a.code, a.name]));
  const missingCodes = Array.from(accountCodes).filter((c) => !accountNameByCode.has(c));
  if (missingCodes.length > 0) {
    return err({
      code: "not_found",
      message: `حسابات غير موجودة في دليل الحسابات: ${missingCodes.join(", ")}. استعمل searchAccount للحصول على الكود الصحيح.`,
    });
  }

  const partyNameById = new Map<number, string>();
  if (partyIds.size > 0) {
    const found = await prisma.party.findMany({
      where: { id: { in: Array.from(partyIds) }, isActive: true },
      select: { id: true, name: true },
    });
    for (const p of found) partyNameById.set(p.id, p.name);
    if (partyNameById.size !== partyIds.size) {
      return err({ code: "not_found", message: "بعض الأطراف غير موجودة. استعمل searchParty أولاً." });
    }
  }

  const ccNameByCode = new Map<string, string>();
  if (costCenterCodes.size > 0) {
    const found = await prisma.costCenter.findMany({
      where: { code: { in: Array.from(costCenterCodes) }, isActive: true },
      select: { code: true, name: true },
    });
    for (const c of found) ccNameByCode.set(c.code, c.name);
    if (ccNameByCode.size !== costCenterCodes.size) {
      return err({ code: "not_found", message: "بعض مراكز التكلفة غير موجودة. استعمل searchCostCenter أولاً." });
    }
  }

  // Persist the draft. Expires after 30 minutes.
  const expiresAt = new Date(ctx.now.getTime() + 30 * 60 * 1000);
  const summary = `${desc} — مدين/دائن ${totalDebit.toFixed(2)} د.أ`;
  const action = await prisma.assistantAction.create({
    data: {
      conversationId: ctx.conversationId,
      kind: "journal_entry",
      summary,
      payload: {
        date,
        description: desc,
        reference: input.reference?.trim() || null,
        lines: input.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: accountNameByCode.get(l.accountCode) ?? null,
          partyId: l.partyId ?? null,
          partyName: l.partyId != null ? partyNameById.get(Number(l.partyId)) ?? null : null,
          costCenterCode: l.costCenterCode ?? null,
          costCenterName: l.costCenterCode ? ccNameByCode.get(l.costCenterCode) ?? null : null,
          debit: round2(Number(l.debit) || 0),
          credit: round2(Number(l.credit) || 0),
          description: l.description ?? null,
        })),
        totals: { debit: totalDebit, credit: totalCredit },
      },
      status: "pending",
      expiresAt,
    },
  });

  return ok({
    actionId: action.id,
    kind: "journal_entry",
    summary,
    expiresAt: expiresAt.toISOString(),
  });
}
