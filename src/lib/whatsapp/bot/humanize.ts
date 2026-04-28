import "server-only";
import { sendBotText } from "./sender";

/**
 * Humanlike message pacing.
 *
 * People rarely send 200-character paragraphs in WhatsApp — they send 2-3
 * shorter bubbles with a perceptible typing pause between them. Mimicking
 * that rhythm is the difference between "feels like a robot" and "feels
 * like a busy receptionist multitasking". Required by the original brief
 * ("لا يشعر... انه يتعامل مع روبوت").
 *
 * Strategy:
 *   1. Split the model's reply at natural punctuation boundaries into
 *      chunks ≤ TARGET_CHARS each.
 *   2. Send each chunk as its own WhatsApp text message.
 *   3. Sleep `BASE_DELAY_MS + chars * MS_PER_CHAR` between sends —
 *      bounded by [MIN_DELAY_MS, MAX_DELAY_MS].
 *   4. Cap at MAX_BUBBLES per turn so the bot can't accidentally spam.
 */

const TARGET_CHARS = 180;
const MAX_BUBBLES = 4;
const BASE_DELAY_MS = 600;
const MS_PER_CHAR = 18;
const MIN_DELAY_MS = 700;
const MAX_DELAY_MS = 2_400;

const SPLIT_RX = /([.!?؟،]\s+|\n+)/g;

export interface SendHumanlikeArgs {
  to: string;
  text: string;
  /** When false, send as a single message even if longer than TARGET_CHARS. */
  pace?: boolean;
  origin?: string;
}

export async function sendHumanlikeText(
  args: SendHumanlikeArgs,
): Promise<void> {
  const text = args.text.trim();
  if (!text) return;

  if (args.pace === false || text.length <= TARGET_CHARS) {
    await sendBotText(args.to, text, { origin: args.origin ?? "bot:llm" });
    return;
  }

  const chunks = splitForBubbles(text, TARGET_CHARS, MAX_BUBBLES);
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      const delay = clamp(
        BASE_DELAY_MS + chunks[i].length * MS_PER_CHAR,
        MIN_DELAY_MS,
        MAX_DELAY_MS,
      );
      await sleep(delay);
    }
    await sendBotText(args.to, chunks[i], { origin: args.origin ?? "bot:llm" });
  }
}

// ───────────────────────────── helpers ─────────────────────────────

/**
 * Split a long text at the nearest sentence/paragraph boundary, then
 * regroup adjacent fragments until each piece is ≤ targetChars. Returns
 * at most `maxBubbles` chunks (the last one absorbs any overflow).
 */
export function splitForBubbles(
  text: string,
  targetChars: number,
  maxBubbles: number,
): string[] {
  const fragments = text.split(SPLIT_RX).filter((f) => f && f.trim().length > 0);
  // The split keeps separators in the array — re-attach them to the
  // preceding fragment so each entry reads naturally.
  const merged: string[] = [];
  for (const f of fragments) {
    if (/^([.!?؟،]\s+|\n+)$/.test(f) && merged.length > 0) {
      merged[merged.length - 1] += f;
    } else {
      merged.push(f);
    }
  }

  const out: string[] = [];
  let current = "";
  for (const piece of merged) {
    if ((current + piece).trim().length <= targetChars) {
      current += piece;
      continue;
    }
    if (current.trim().length > 0) {
      out.push(current.trim());
      current = piece;
    } else {
      // Single fragment exceeds the budget — hard-split at a space.
      const hard = hardSplit(piece, targetChars);
      out.push(...hard.slice(0, -1));
      current = hard[hard.length - 1];
    }
    if (out.length >= maxBubbles - 1) break;
  }
  if (current.trim().length > 0) out.push(current.trim());

  // If we exceeded the bubble cap, glue the tail into the last allowed bubble.
  if (out.length > maxBubbles) {
    const head = out.slice(0, maxBubbles - 1);
    const tail = out.slice(maxBubbles - 1).join(" ");
    return [...head, tail];
  }
  return out;
}

function hardSplit(text: string, targetChars: number): string[] {
  const out: string[] = [];
  let remaining = text;
  while (remaining.length > targetChars) {
    let cut = remaining.lastIndexOf(" ", targetChars);
    if (cut < targetChars * 0.5) cut = targetChars;
    out.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) out.push(remaining);
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
