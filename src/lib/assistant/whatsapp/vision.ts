import "server-only";
import OpenAI from "openai";
import { decryptSecret } from "@/lib/booking/encryption";
import { prisma } from "@/lib/prisma";
import { fetchMediaStream } from "@/lib/whatsapp/client";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Vision-capable models tried in order. `gpt-4o-mini` is the cost-quality
 * sweet spot for hotel use cases (IDs, receipts, room damage photos);
 * `gpt-4o` is a richer fallback. Keep additions in declining-cost order
 * so the cheap model wins when entitled.
 */
const VISION_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"] as const;

const SUPPORTED_MIME_PREFIXES = ["image/"];

export type ImageDescriptionResult =
  | { ok: true; text: string; model: string }
  | {
      ok: false;
      error:
        | "missing_key"
        | "unsupported_provider"
        | "unsupported_format"
        | "too_large"
        | "no_vision_access"
        | "failed";
    };

/**
 * Download a WhatsApp image (any supported still format) and ask the
 * LLM to describe it in Arabic with structured detail. Used by the
 * staff assistant so an image becomes "as if the staff typed a careful
 * description" — feeding the same engine that handles text turns.
 *
 * The Arabic instruction asks the model to:
 *   • detect the kind of subject (ID/passport/receipt/invoice/room
 *     damage/handwritten note/screenshot/other),
 *   • extract all readable text verbatim,
 *   • surface structured fields when applicable (name, ID number,
 *     amount, date, vendor, …),
 *   • flag unreadable parts instead of inventing values.
 */
export async function describeWhatsAppImage(args: {
  mediaId: string;
  caption?: string | null;
  mimeType?: string | null;
}): Promise<ImageDescriptionResult> {
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

  const apiKey = cfg?.botLlmApiKeyEnc ? decryptSecret(cfg.botLlmApiKeyEnc) : null;
  if (!apiKey) return { ok: false, error: "missing_key" };

  let buffer: ArrayBuffer;
  let mimeType: string;
  try {
    const { response, info } = await fetchMediaStream(args.mediaId);
    const size = info.file_size ?? Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(size) && size > MAX_IMAGE_BYTES) {
      return { ok: false, error: "too_large" };
    }

    buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) return { ok: false, error: "failed" };
    if (buffer.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };

    mimeType = (
      info.mime_type ||
      response.headers.get("content-type") ||
      args.mimeType ||
      "image/jpeg"
    ).toLowerCase();

    if (!SUPPORTED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
      return { ok: false, error: "unsupported_format" };
    }
  } catch (error) {
    console.error("[assistant/wa] image download failed", error);
    return { ok: false, error: "failed" };
  }

  const dataUrl = `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
  const client = new OpenAI({ apiKey });
  const captionLine = args.caption?.trim()
    ? `كتب الموظف تعليقاً مع الصورة: «${args.caption.trim()}». ادمج التعليق في الفهم.`
    : "لم يكتب الموظف أي تعليق مع الصورة. اعتمد على الصورة وحدها.";

  const userPrompt = [
    "حلّل الصورة بدقة لاستخدامها داخل نظام إدارة فندق.",
    captionLine,
    "أعد ردّاً عربياً مختصراً ومنظّماً يتضمن:",
    "1) **نوع الصورة**: (هوية/جواز/إيصال/فاتورة/ضرر بالغرفة/شاشة/مذكرة/أخرى).",
    "2) **النصوص المقروءة**: انسخ كل النصوص المقروءة كما هي (عربي/إنجليزي/أرقام).",
    "3) **بيانات منظّمة** (إن وُجدت): الاسم، رقم الهوية/الجواز، الجنسية، تاريخ الميلاد، تاريخ الانتهاء، المبلغ والعملة، التاريخ، المورّد، رقم العمليّة، رقم الغرفة...",
    "4) **ملاحظات مهمة للنظام**: اقتراح خطوة عملية واضحة (قيد محاسبي مسودة، ضيف جديد، طلب صيانة، إلخ).",
    "ممنوع تأليف بيانات غير ظاهرة. لو جزء غير واضح اكتب «غير واضح».",
  ].join("\n");

  let lastError: unknown = null;
  let allEntitlement = true;
  for (const model of VISION_MODELS) {
    try {
      const completion = await client.chat.completions.create({
        model,
        max_tokens: 700,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "أنت مساعد رؤية يخدم موظفي الفندق. ردودك عربية، منظّمة، دقيقة، ولا تخمّن.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
            ],
          },
        ],
      });
      const text = completion.choices[0]?.message?.content?.trim() ?? "";
      if (!text) {
        lastError = new Error("empty_completion");
        continue;
      }
      return { ok: true, text, model };
    } catch (error) {
      lastError = error;
      const isEntitlement = isEntitlementError(error);
      if (!isEntitlement) {
        allEntitlement = false;
        console.error(`[assistant/wa] image vision failed (${model})`, error);
        return { ok: false, error: "failed" };
      }
      console.warn(`[assistant/wa] vision model "${model}" unavailable, falling back`, error);
    }
  }

  console.error("[assistant/wa] all vision models failed", lastError);
  return { ok: false, error: allEntitlement ? "no_vision_access" : "failed" };
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
