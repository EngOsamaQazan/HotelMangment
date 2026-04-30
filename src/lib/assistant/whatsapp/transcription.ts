import "server-only";
import OpenAI from "openai";
import { decryptSecret } from "@/lib/booking/encryption";
import { prisma } from "@/lib/prisma";
import { fetchMediaStream } from "@/lib/whatsapp/client";

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

export type AudioTranscriptionResult =
  | { ok: true; text: string }
  | { ok: false; error: "missing_key" | "unsupported_provider" | "too_large" | "empty" | "failed" };

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

  try {
    const { response, info } = await fetchMediaStream(mediaId);
    const size = info.file_size ?? Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(size) && size > MAX_AUDIO_BYTES) {
      return { ok: false, error: "too_large" };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return { ok: false, error: "empty" };
    if (buffer.byteLength > MAX_AUDIO_BYTES) return { ok: false, error: "too_large" };

    const mimeType = info.mime_type || response.headers.get("content-type") || "audio/ogg";
    const file = new File([buffer], `whatsapp-audio.${extensionForMime(mimeType)}`, {
      type: mimeType,
    });
    const client = new OpenAI({ apiKey });
    const transcript = await client.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
      language: "ar",
    });

    const text = transcript.text.trim();
    if (!text) return { ok: false, error: "empty" };
    return { ok: true, text };
  } catch (error) {
    console.error("[assistant/wa] audio transcription failed", error);
    return { ok: false, error: "failed" };
  }
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
