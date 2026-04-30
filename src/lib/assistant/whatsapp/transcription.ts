import "server-only";
import { fetchMediaStream } from "@/lib/whatsapp/client";
import {
  transcribeAudioBuffer,
  type AudioTranscriptionResult,
} from "@/lib/assistant/media/transcribe";

export type { AudioTranscriptionResult } from "@/lib/assistant/media/transcribe";

/**
 * WhatsApp-specific wrapper: pull a Meta media id over the WA Cloud API,
 * then delegate to the shared `transcribeAudioBuffer` helper. Production
 * media downloads run through `fetchMediaStream` so we re-use its bearer-
 * token plumbing and content-length budget enforcement.
 */
export async function transcribeWhatsAppAudio(
  mediaId: string,
): Promise<AudioTranscriptionResult> {
  let buffer: ArrayBuffer;
  let mimeType: string;
  try {
    const { response, info } = await fetchMediaStream(mediaId);
    buffer = await response.arrayBuffer();
    mimeType = info.mime_type || response.headers.get("content-type") || "audio/ogg";
  } catch (error) {
    console.error("[assistant/wa] audio download failed", error);
    return { ok: false, error: "failed" };
  }
  return transcribeAudioBuffer({ buffer, mimeType });
}
