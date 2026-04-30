import "server-only";

// ---------------------------------------------------------------------------
// Apology / failure detection for the staff assistant.
//
// Heuristic only — we do NOT call the LLM here. The signal feeds two paths:
//   1. The engine triggers ONE reflection retry when an apology is detected
//      after the initial generation, before persisting the final reply.
//   2. After reflection still fails, we record an `AssistantFailure` row so
//      the admin inbox at /settings/assistant/learning can review it and
//      (optionally) generate a curated lesson.
//
// Patterns are tuned on the project's dialect of Arabic apologies. False
// positives are cheap (one extra LLM hop); false negatives mean the model
// gets away with apologising without the system trying to learn.
// ---------------------------------------------------------------------------

const APOLOGY_PATTERNS: { re: RegExp; tag: AssistantFailureTag }[] = [
  // "I couldn't / wasn't able to ..."
  { re: /\b(?:تعذّر|تعذر|لم\s+أتمكّن|لم\s+أتمكن|لم\s+أستطع)\b/u, tag: "not_found" },
  // Explicit "I don't have / there is no info"
  { re: /\b(?:لا\s+أملك|لا\s+تتوفّر|لا\s+تتوفر|لا\s+توجد\s+(?:معلومات|بيانات)|بيانات\s+غير\s+كافية|معلومات\s+غير\s+كافية|لا\s+توجد\s+نتائج)\b/u, tag: "not_found" },
  // "I can't / not allowed"
  { re: /\b(?:لا\s+أستطيع|لا\s+يمكنني|غير\s+قادر)\b/u, tag: "not_found" },
  // Explicit lack-of-permission language
  { re: /\b(?:لا\s+تملك\s+(?:الصلاحية|صلاحية)|ليست\s+لديك\s+(?:الصلاحية|صلاحية)|بحاجة\s+إلى\s+صلاحية|صلاحياتك\s+لا\s+تسمح)\b/u, tag: "no_permission" },
  // "Sorry / apologies"
  { re: /\b(?:أعتذر|آسف|عذرًا|عذراً|عذرا|متأسف)\b/u, tag: "not_found" },
  // "Need more details to ..."
  { re: /\b(?:بحاجة\s+(?:إلى\s+)?(?:مزيد|المزيد)|أحتاج\s+(?:إلى\s+)?(?:مزيد|المزيد)|أعد\s+صياغة|وضّح|وضح\s+أكثر)\b/u, tag: "unclear" },
];

export type AssistantFailureTag =
  | "not_found"
  | "no_permission"
  | "unclear"
  | "hallucinated";

export interface ApologyDetection {
  isApology: boolean;
  /** Empty when `isApology=false`; otherwise the matched tags (deduped). */
  tags: AssistantFailureTag[];
  /** First matched substring — handy for debugging only. */
  matched?: string;
}

/**
 * Cheap regex scan. Returns `isApology=true` if any of the apology patterns
 * fire on the assistant's reply. Tags are useful for both the admin inbox
 * (filtering) and the lesson-drafter prompt (so the drafter knows whether
 * to recommend a tool, a permission tweak, or a clarification rule).
 *
 * Edge cases handled:
 *   - Empty / whitespace-only text is treated as a non-apology (the engine
 *     handles empty replies separately).
 *   - We deliberately do not flag confirmations like "تم تجهيز المسودة"
 *     because they don't match any of the patterns above.
 */
export function detectApology(text: string | null | undefined): ApologyDetection {
  const t = (text ?? "").trim();
  if (!t) return { isApology: false, tags: [] };

  const tags = new Set<AssistantFailureTag>();
  let firstMatch: string | undefined;
  for (const p of APOLOGY_PATTERNS) {
    const m = p.re.exec(t);
    if (m) {
      tags.add(p.tag);
      if (!firstMatch) firstMatch = m[0];
    }
  }
  if (tags.size === 0) return { isApology: false, tags: [] };
  return { isApology: true, tags: [...tags], matched: firstMatch };
}

/**
 * After we've confirmed an apology, look at the tools list to refine tags.
 * If the model emitted no tool calls *at all* during the failing turn, we
 * add the `hallucinated` tag — apologising without trying any read tool is
 * the worst failure mode and deserves explicit treatment in the inbox.
 */
export function classifyFailure(
  detection: ApologyDetection,
  toolsTried: ReadonlyArray<{ name: string; ok: boolean }>,
): AssistantFailureTag[] {
  if (!detection.isApology) return [];
  const tags = new Set(detection.tags);
  if (toolsTried.length === 0) tags.add("hallucinated");
  return [...tags];
}
