import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Lazy-load `docs/staff-help.md` once per process and cache it in memory.
 *
 * The file is small (~5KB) so we just inline it whole into the system prompt
 * — no chunking / embeddings / RAG needed. The model is good enough at
 * grounding on a 5KB context to pull out the right answer for "كيف أفعل X".
 *
 * Failures are non-fatal: if the file is missing the prompt falls back to
 * answering from the dynamic page-context block alone.
 */

let cached: string | null | undefined;

export async function loadHelpDocs(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const filePath = path.join(process.cwd(), "docs", "staff-help.md");
    const content = await fs.readFile(filePath, "utf8");
    cached = content;
    return cached;
  } catch (e) {
    console.warn("[assistant/help-docs] could not load docs/staff-help.md:", (e as Error).message);
    cached = null;
    return null;
  }
}

/** Test-only — flush the cache. */
export function _resetHelpDocsCache() {
  cached = undefined;
}
