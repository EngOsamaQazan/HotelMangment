import "server-only";
import OpenAI from "openai";
import { decryptSecret } from "@/lib/booking/encryption";
import { prisma } from "@/lib/prisma";

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
/**
 * Models tried in order. `whisper-1` is the GA endpoint that every OpenAI
 * project gets by default; the newer `gpt-4o-*-transcribe` models are
 * cheaper and slightly more accurate but may require explicit project
 * access, so we attempt them first and gracefully fall back when the
 * project key isn't entitled.
 */
const TRANSCRIPTION_MODELS = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1",
] as const;

export type AudioTranscriptionResult =
  | { ok: true; text: string; model: string }
  | {
      ok: false;
      error:
        | "missing_key"
        | "unsupported_provider"
        | "too_large"
        | "empty"
        | "no_audio_access"
        | "failed";
    };

/**
 * Provider-agnostic audio → text helper. Used by both the WhatsApp staff
 * pipeline (which downloads the file from Meta first) and the in-app
 * assistant chat (which receives the bytes from the browser via fetch
 * upload). Reads the configured OpenAI key from `WhatsAppConfig` like the
 * rest of the assistant stack.
 */
export async function transcribeAudioBuffer(args: {
  buffer: ArrayBuffer | Buffer;
  mimeType?: string | null;
  language?: string;
}): Promise<AudioTranscriptionResult> {
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: { botLlmProvider: true, botLlmApiKeyEnc: true },
  });

  if ((cfg?.botLlmProvider ?? "openai") !== "openai") {
    return { ok: false, error: "unsupported_provider" };
  }

  const apiKey = cfg?.botLlmApiKeyEnc ? decryptSecret(cfg.botLlmApiKeyEnc) : null;
  if (!apiKey) return { ok: false, error: "missing_key" };

  const bytes =
    args.buffer instanceof Uint8Array
      ? new Uint8Array(args.buffer)
      : new Uint8Array(args.buffer as ArrayBuffer);
  if (bytes.byteLength === 0) return { ok: false, error: "empty" };
  if (bytes.byteLength > MAX_AUDIO_BYTES) return { ok: false, error: "too_large" };

  const mimeType = (args.mimeType || "audio/ogg").toLowerCase();
  const client = new OpenAI({ apiKey });
  const language = (args.language || "ar").trim() || "ar";

  let lastError: unknown = null;
  let allEntitlement = true;
  for (const model of TRANSCRIPTION_MODELS) {
    try {
      const file = new File([bytes], `audio.${extensionForMime(mimeType)}`, {
        type: mimeType,
      });
      const transcript = await client.audio.transcriptions.create({
        file,
        model,
        language,
      });
      const text = transcript.text.trim();
      if (!text) return { ok: false, error: "empty" };
      return { ok: true, text, model };
    } catch (error) {
      lastError = error;
      const isEntitlement = isEntitlementError(error);
      if (!isEntitlement) {
        allEntitlement = false;
        console.error(`[assistant/media] transcription failed (${model})`, error);
        return { ok: false, error: "failed" };
      }
      console.warn(
        `[assistant/media] transcription model "${model}" unavailable, falling back`,
        error,
      );
    }
  }
  console.error("[assistant/media] all transcription models failed", lastError);
  return { ok: false, error: allEntitlement ? "no_audio_access" : "failed" };
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("amr")) return "amr";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("webm")) return "webm";
  return "ogg";
}

function isEntitlementError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: number }).status;
  if (status === 403 || status === 404) return true;
  const message = (error as { message?: string }).message?.toLowerCase() ?? "";
  return (
    message.includes("does not have access to model") ||
    message.includes("model_not_found") ||
    message.includes("unknown model")
  );
}
