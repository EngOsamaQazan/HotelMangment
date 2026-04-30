import "server-only";
import OpenAI from "openai";
import { decryptSecret } from "@/lib/booking/encryption";
import { prisma } from "@/lib/prisma";
import { fetchMediaStream } from "@/lib/whatsapp/client";

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
/**
 * Models tried in order. `whisper-1` is the GA endpoint that every OpenAI
 * project gets by default; the newer `gpt-4o-*-transcribe` models are
 * cheaper and slightly more accurate but require explicit project access,
 * so we attempt them first and gracefully fall back when the project key
 * isn't entitled.
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

export async function transcribeWhatsAppAudio(
  mediaId: string,
): Promise<AudioTranscriptionResult> {
  const cfg = await prisma.whatsAppConfig.findUnique({
    where: { id: 1 },
    select: {
      botLlmProvider: true,
      botLlmApiKeyEnc: true,
    },
  });

  if ((cfg?.botLlmProvider ?? "openai") !== "openai") {
    return { ok: false, error: "unsupported_provider" };
  }

  const enc = cfg?.botLlmApiKeyEnc;
  const apiKey = enc ? decryptSecret(enc) : null;
  if (!apiKey) return { ok: false, error: "missing_key" };

  let buffer: ArrayBuffer;
  let mimeType: string;
  try {
    const { response, info } = await fetchMediaStream(mediaId);
    const size = info.file_size ?? Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(size) && size > MAX_AUDIO_BYTES) {
      return { ok: false, error: "too_large" };
    }

    buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return { ok: false, error: "empty" };
    if (buffer.byteLength > MAX_AUDIO_BYTES) return { ok: false, error: "too_large" };

    mimeType = info.mime_type || response.headers.get("content-type") || "audio/ogg";
  } catch (error) {
    console.error("[assistant/wa] audio download failed", error);
    return { ok: false, error: "failed" };
  }

  const client = new OpenAI({ apiKey });
  let lastError: unknown = null;
  let allEntitlement = true;
  for (const model of TRANSCRIPTION_MODELS) {
    try {
      const file = new File([buffer], `whatsapp-audio.${extensionForMime(mimeType)}`, {
        type: mimeType,
      });
      const transcript = await client.audio.transcriptions.create({
        file,
        model,
        language: "ar",
      });
      const text = transcript.text.trim();
      if (!text) return { ok: false, error: "empty" };
      return { ok: true, text, model };
    } catch (error) {
      lastError = error;
      const isEntitlement = isEntitlementError(error);
      if (!isEntitlement) {
        allEntitlement = false;
        console.error(`[assistant/wa] audio transcription failed (${model})`, error);
        return { ok: false, error: "failed" };
      }
      console.warn(`[assistant/wa] transcription model "${model}" unavailable, falling back`, error);
    }
  }
  console.error("[assistant/wa] all transcription models failed", lastError);
  return { ok: false, error: allEntitlement ? "no_audio_access" : "failed" };
}

/**
 * True when the error reflects "this OpenAI project key isn't entitled to
 * this audio model" (403 / 404 / model_not_found). We retry with the next
 * model in that case; auth/network errors must surface immediately.
 */
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

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("amr")) return "amr";
  if (normalized.includes("wav")) return "wav";
  return "ogg";
}
