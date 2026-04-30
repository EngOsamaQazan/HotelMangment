import "server-only";
import { fetchMediaStream } from "@/lib/whatsapp/client";
import {
  describeImageBuffer,
  type ImageDescriptionResult,
} from "@/lib/assistant/media/describe-image";

export type { ImageDescriptionResult } from "@/lib/assistant/media/describe-image";

/**
 * WhatsApp-specific wrapper: download the image bytes from Meta then run
 * the shared Vision helper. Caption is forwarded so the model can blend
 * the staff's note into its description.
 */
export async function describeWhatsAppImage(args: {
  mediaId: string;
  caption?: string | null;
  mimeType?: string | null;
}): Promise<ImageDescriptionResult> {
  let buffer: ArrayBuffer;
  let mimeType: string;
  try {
    const { response, info } = await fetchMediaStream(args.mediaId);
    buffer = await response.arrayBuffer();
    mimeType = (
      info.mime_type ||
      response.headers.get("content-type") ||
      args.mimeType ||
      "image/jpeg"
    ).toLowerCase();
  } catch (error) {
    console.error("[assistant/wa] image download failed", error);
    return { ok: false, error: "failed" };
  }
  return describeImageBuffer({ buffer, mimeType, caption: args.caption });
}
