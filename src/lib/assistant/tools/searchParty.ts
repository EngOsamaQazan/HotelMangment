import "server-only";
import { prisma } from "@/lib/prisma";
import type { ToolJsonSchema } from "@/lib/llm/types";
import { normalizeArabic } from "../arabic";
import {
  err,
  ok,
  type AssistantToolContext,
  type AssistantToolResult,
} from "../types";

export interface SearchPartyInput {
  query: string;
  type?: "guest" | "partner" | "supplier" | "employee" | "lender" | "other" | null;
}

export interface SearchPartyOutput {
  /**
   * Candidates ranked by closeness to the query. The list is NEVER empty
   * when at least one party of the requested `type` exists in the system —
   * the engine intentionally returns every party of the type as a fallback
   * so the LLM can reason about near-misses (e.g. "ايهاب" vs "إيهاب") and
   * ask the user "هل تقصد X؟" instead of giving up.
   */
  parties: Array<{
    id: number;
    name: string;
    type: string;
    phone: string | null;
    apAccountId: number | null;
    arAccountId: number | null;
    equityAccountId: number | null;
    drawAccountId: number | null;
    /** "exact" if the normalized query is a substring of the normalized name; otherwise "fallback". */
    match: "exact" | "fallback";
  }>;
  /** Total number of parties of the type in the system (helps the model gauge whether to ask). */
  totalForType: number;
  /** When `match=fallback`, this hint primes the model to ask for confirmation. */
  hint: string;
}

export const searchPartySchema: ToolJsonSchema = {
  name: "searchParty",
  description:
    "ابحث عن طرف محاسبي (موظف، شريك، مورد، عميل، مُقرض). إذا لم يطابق أحد بدقّة، تُعيد الأداة قائمة الأقرب من نفس النوع لتقرّر بنفسك — يكفي أن تنظر للأسماء المشابهة وتسأل المستخدم \"هل تقصد X؟\" بدلاً من الاعتذار. الاسم في القاعدة قد يحتوي همزات أو ألفات مختلفة عمّا كتبه المستخدم.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "اسم أو هاتف الطرف. يقبل أي شكل عربي (مع/بدون همزة، ألف ممدودة، …).",
      },
      type: {
        type: ["string", "null"],
        enum: ["guest", "partner", "supplier", "employee", "lender", "other", null],
        description: "تصفية اختيارية حسب نوع الطرف. مرّر النوع المتوقع (مثل employee) للحصول على fallback list أنظف.",
      },
    },
    required: ["query", "type"],
    additionalProperties: false,
  },
};

const MAX_RESULTS = 15;

/**
 * Always-returns-candidates search.
 *
 *   1. Compute a normalized version of the query (`normalizeArabic`).
 *   2. Pull all active parties of the requested type (or all if not given).
 *   3. Rank them: exact substring on normalized name first; phone substring
 *      next; alphabetical fallback after that.
 *   4. Return up to `MAX_RESULTS`. The LLM gets the same shape every time
 *      — never an empty list when parties exist — so it can suggest a
 *      "did you mean" instead of giving up.
 */
export async function searchParty(
  input: SearchPartyInput,
  _ctx: AssistantToolContext,
): Promise<AssistantToolResult<SearchPartyOutput>> {
  const raw = (input?.query ?? "").trim();
  if (!raw) return err({ code: "bad_input", message: "query فارغ", field: "query" });

  const normalizedQuery = normalizeArabic(raw);
  const phoneQuery = raw.replace(/[^0-9+]/g, "");

  const all = await prisma.party.findMany({
    where: {
      isActive: true,
      ...(input.type ? { type: input.type } : {}),
    },
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      apAccountId: true,
      arAccountId: true,
      equityAccountId: true,
      drawAccountId: true,
    },
    orderBy: { name: "asc" },
  });

  const totalForType = all.length;

  const ranked = all
    .map((p) => {
      const folded = normalizeArabic(p.name);
      const exactName = normalizedQuery.length > 0 && folded.includes(normalizedQuery);
      const exactPhone =
        phoneQuery.length >= 4 && p.phone != null && p.phone.includes(phoneQuery);
      const isExact = exactName || exactPhone;
      // Cheap "edit distance" proxy: count of shared characters in same order.
      // Good enough for ranking near-misses without pulling in pg_trgm.
      let score = 0;
      const a = normalizedQuery;
      const b = folded;
      let i = 0;
      let j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
          score += 1;
          i += 1;
        }
        j += 1;
      }
      return { p, isExact, score };
    })
    .sort((x, y) => {
      if (x.isExact !== y.isExact) return x.isExact ? -1 : 1;
      if (x.score !== y.score) return y.score - x.score;
      return x.p.name.localeCompare(y.p.name);
    })
    .slice(0, MAX_RESULTS);

  const anyExact = ranked.some((r) => r.isExact);
  const hint = anyExact
    ? "تطابق دقيق وُجد. استعمل id الطرف الأنسب مباشرة."
    : "لم يوجد تطابق دقيق. هذه أقرب الأسماء — اعرض على المستخدم أقرب اسم واحد أو اثنين بسؤال \"هل تقصد …؟\" قبل المتابعة. لا تطلب منه إعادة الكتابة لو الفرق مجرد همزة/ألف.";

  return ok({
    parties: ranked.map(({ p, isExact }) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      phone: p.phone,
      apAccountId: p.apAccountId,
      arAccountId: p.arAccountId,
      equityAccountId: p.equityAccountId,
      drawAccountId: p.drawAccountId,
      match: isExact ? ("exact" as const) : ("fallback" as const),
    })),
    totalForType,
    hint,
  });
}
