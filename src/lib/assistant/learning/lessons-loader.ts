import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeArabic } from "../arabic";

// ---------------------------------------------------------------------------
// Lessons loader: pulls the admin-approved AssistantLesson rows that should
// be injected into the system prompt for the current turn, scores them by
// relevance against the most recent user message, picks the top N, and
// (best-effort, fire-and-forget) bumps their usage stats so frequently
// triggered lessons rise to the top of future selections.
//
// We deliberately don't do RAG/embeddings here — the per-turn budget is
// small (a dozen lessons max) and a keyword-overlap score on Arabic-folded
// text gets us 95% of the value at zero ML infra cost.
// ---------------------------------------------------------------------------

const TOTAL_BUDGET = 12;
const GLOBAL_FLOOR = 4; // Always keep at least this many global lessons in scope.

export interface LoadedLesson {
  id: number;
  title: string;
  scope: string;
  guidance: string;
  /** Score used for ordering; 0 means "no keyword overlap, kept by usage rank". */
  score: number;
}

interface DbLesson {
  id: number;
  title: string;
  scope: string;
  guidance: string;
  triggerKeywords: string;
  usageCount: number;
}

/**
 * Build the "lessons memory" set for one turn.
 *
 * @param recentUserText   Last user message (post-sanitisation). Empty
 *                         string is fine — the loader falls back to global
 *                         lessons ranked purely by usage.
 * @param now              Wall-clock for `lastUsedAt`. Injected so tests
 *                         can pin a moment.
 *
 * Side-effect: bumps `usageCount`/`lastUsedAt` on every returned row. The
 * update is async (we don't await it) so the engine isn't blocked.
 */
export async function loadActiveLessons(
  recentUserText: string,
  now: Date = new Date(),
): Promise<LoadedLesson[]> {
  // Pull a generous candidate set so we have room to rank by relevance.
  // We cap at 60 to avoid pathological prompts when the lesson library
  // grows huge — anything beyond this is unlikely to ever be selected.
  const rows: DbLesson[] = await prisma.assistantLesson.findMany({
    where: { status: "approved" },
    select: {
      id: true,
      title: true,
      scope: true,
      guidance: true,
      triggerKeywords: true,
      usageCount: true,
    },
    orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
    take: 60,
  });
  if (rows.length === 0) return [];

  const folded = normalizeArabic(recentUserText);
  const userTokens = folded.split(/\s+/).filter((s) => s.length >= 3);

  type Scored = LoadedLesson & { isGlobal: boolean };
  const scored: Scored[] = rows.map((r) => {
    const keywords = r.triggerKeywords
      .split(",")
      .map((k) => normalizeArabic(k))
      .filter(Boolean);
    let score = 0;
    if (keywords.length === 0) {
      // No triggers: lesson is "always-on" — give it a small base score
      // so it rises above unrelated keyword-only lessons.
      score = 0.1 + Math.min(r.usageCount / 100, 0.4);
    } else {
      for (const kw of keywords) {
        if (!kw) continue;
        if (folded.includes(kw)) {
          score += 1;
        } else {
          for (const tok of userTokens) {
            if (tok.includes(kw) || kw.includes(tok)) {
              score += 0.4;
              break;
            }
          }
        }
      }
      // Tiny tiebreaker on usage so popular lessons surface first when
      // multiple lessons match the same keyword count.
      score += Math.min(r.usageCount / 1000, 0.5);
    }
    return {
      id: r.id,
      title: r.title,
      scope: r.scope,
      guidance: r.guidance,
      score,
      isGlobal: r.scope === "global",
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Reserve a floor for global lessons so module-specific ones don't crowd
  // them out entirely on a turn that happens to mention a module keyword.
  const globals = scored.filter((s) => s.isGlobal).slice(0, GLOBAL_FLOOR);
  const nonGlobals = scored.filter((s) => !s.isGlobal);

  const picked: Scored[] = [];
  const seen = new Set<number>();
  for (const g of globals) {
    if (g.score === 0 && picked.length >= TOTAL_BUDGET) break;
    picked.push(g);
    seen.add(g.id);
    if (picked.length >= TOTAL_BUDGET) break;
  }
  for (const n of nonGlobals) {
    if (picked.length >= TOTAL_BUDGET) break;
    if (seen.has(n.id)) continue;
    if (n.score <= 0) continue; // Don't waste budget on irrelevant non-globals.
    picked.push(n);
    seen.add(n.id);
  }

  // Fill any remaining budget with the next best by raw score.
  if (picked.length < TOTAL_BUDGET) {
    for (const s of scored) {
      if (picked.length >= TOTAL_BUDGET) break;
      if (seen.has(s.id)) continue;
      if (s.score <= 0) continue;
      picked.push(s);
      seen.add(s.id);
    }
  }

  // Fire-and-forget usage bookkeeping.
  if (picked.length > 0) {
    void prisma.assistantLesson
      .updateMany({
        where: { id: { in: picked.map((p) => p.id) } },
        data: { usageCount: { increment: 1 }, lastUsedAt: now },
      })
      .catch((e) => {
        console.warn("[assistant/learning] failed to bump usage", e);
      });
  }

  return picked.map(({ id, title, scope, guidance, score }) => ({
    id,
    title,
    scope,
    guidance,
    score,
  }));
}

/**
 * Format a lessons array as the markdown chunk we paste into the system
 * prompt. Returns an empty string when there are no lessons so the prompt
 * doesn't get noisy section headers for new installs.
 */
export function formatLessonsForPrompt(lessons: LoadedLesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons
    .map((l) => `- [${l.scope}] ${l.title}: ${l.guidance.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  return `
# ذاكرة الدروس المعتمدة (تمّت موافقة المدير)
هذه قواعد سلوك تعلّمها النظام من تجارب سابقة. التزم بها قبل أن تعتذر:
${lines}
`.trim();
}
