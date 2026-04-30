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
//
// IMPORTANT: JavaScript regex `\b` is ASCII-only — it never fires around
// Arabic letters. The patterns below therefore avoid `\b` and rely on the
// `u` (unicode) flag plus explicit non-letter lookarounds where needed.
// ---------------------------------------------------------------------------

const APOLOGY_PATTERNS: { re: RegExp; tag: AssistantFailureTag }[] = [
  // "I couldn't / wasn't able to ..."
  { re: /(?:تعذّر|تعذر|لم\s+أتمكّن|لم\s+أتمكن|لم\s+أستطع|لم\s+أجد|لم\s+يتمكّن|لم\s+يتمكن)/u, tag: "not_found" },
  // Explicit "I don't have / there is no info"
  { re: /(?:لا\s+أملك|لا\s+تتوفّر|لا\s+تتوفر|لا\s+توجد\s+(?:معلومات|بيانات|نتائج|سجلات)|بيانات\s+غير\s+كافية|معلومات\s+غير\s+كافية|بيانات\s+ناقصة)/u, tag: "not_found" },
  // "I can't / not allowed / unable to retrieve"
  { re: /(?:لا\s+أستطيع|لا\s+يمكنني|غير\s+قادر|غير\s+متاح\s+لي|ليس\s+بإمكاني|ليس\s+بمقدوري)/u, tag: "not_found" },
  // Specific failure phrasing seen in production: "looks like there's a
  // problem / I had a problem / there was an issue while running the tool"
  { re: /(?:يبدو\s+أن\s+هناك\s+مشكلة|واجهت\s+مشكلة|حدثت\s+مشكلة|توجد\s+مشكلة|مشكلة\s+في\s+(?:استعلام|الاستعلام|الأداة|الاتصال|قاعدة\s+البيانات)|تعذّر\s+تشغيل\s+الأداة|الأداة\s+لم\s+ترجع)/u, tag: "tool_error" },
  // Hedging / "the result might be inaccurate"
  { re: /(?:غير\s+دقيق|قد\s+(?:لا\s+)?يكون\s+(?:دقيقاً|دقيقا)|لست\s+متأكداً|لست\s+متأكدا|لا\s+يمكن\s+التأكّد|لا\s+يمكن\s+التأكد)/u, tag: "uncertain" },
  // Explicit lack-of-permission language
  { re: /(?:لا\s+تملك\s+(?:الصلاحية|صلاحية)|ليست\s+لديك\s+(?:الصلاحية|صلاحية)|بحاجة\s+إلى\s+صلاحية|صلاحياتك\s+لا\s+تسمح|صلاحية\s+(?:الوصول|التنفيذ))/u, tag: "no_permission" },
  // "Sorry / apologies"
  { re: /(?:أعتذر|أعتذرُ|آسف|عذرًا|عذراً|عذرا|متأسف|نأسف)/u, tag: "not_found" },
  // "Need more details to ..."
  { re: /(?:بحاجة\s+(?:إلى\s+)?(?:مزيد|المزيد)|أحتاج\s+(?:إلى\s+)?(?:مزيد|المزيد)|أعد\s+صياغة|وضّح|وضح\s+أكثر|هل\s+يمكنك\s+توضيح)/u, tag: "unclear" },
  // Counter-question instead of an answer ("هل ترغب…؟" before any data shown)
  { re: /(?:هل\s+ترغب|هل\s+تريد|هل\s+تود|هل\s+تفضّل|هل\s+تفضل)\s+(?:في\s+)?(?:معرفة|الاطلاع|الحصول)/u, tag: "deflection" },
];

export type AssistantFailureTag =
  | "not_found"
  | "no_permission"
  | "unclear"
  | "hallucinated"
  | "tool_error"
  | "uncertain"
  | "deflection";

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
