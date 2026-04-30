import "server-only";

/**
 * Light Arabic normalization used to rank search candidates.
 *
 * Philosophy: the LLM is good at reading and reasoning about Arabic name
 * variations (hamza on/off, alef variants, ya/alef-maqsura …). We don't
 * try to "understand" the variation here — we just fold both sides onto a
 * canonical form so a substring match still surfaces the row, and let the
 * model decide whether the candidate is the right person and whether to
 * confirm with the user ("هل تقصد X؟").
 *
 * Folds:
 *   أ إ آ ٱ ا → ا
 *   ي ى ئ → ي
 *   ة → ه
 *   ؤ → و
 *   ء → "" (drop)
 *   tatweel + diacritics → stripped
 */

const FROM = "أإآٱىئةؤ";
const TO   = "اااايييهو";

export function normalizeArabic(input: string): string {
  if (!input) return "";
  let out = input.normalize("NFKC");
  // Strip tashkeel, tatweel, BiDi marks.
  out = out.replace(/[\u064B-\u0652\u0670\u0640\u0610-\u061A\u06D6-\u06ED\u200E\u200F]+/g, "");
  // Drop bare hamza so "ايهاب" ≡ "إيهاب" after folding.
  out = out.replace(/\u0621/g, "");
  let folded = "";
  for (const ch of out) {
    const idx = FROM.indexOf(ch);
    folded += idx >= 0 ? TO[idx] : ch;
  }
  return folded.toLowerCase().trim();
}
