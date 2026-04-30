import "server-only";
import OpenAI from "openai";
import { decryptSecret } from "@/lib/booking/encryption";
import { prisma } from "@/lib/prisma";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
 * Provider-agnostic image → structured Arabic description helper.
 * Same prompt + fallback chain as the WhatsApp pipeline; works on raw
 * bytes (browser upload, WhatsApp media download, etc.).
 */
export async function describeImageBuffer(args: {
  buffer: ArrayBuffer | Buffer;
  mimeType?: string | null;
  caption?: string | null;
}): Promise<ImageDescriptionResult> {
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
  if (bytes.byteLength === 0) return { ok: false, error: "failed" };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };

  const mimeType = (args.mimeType || "image/jpeg").toLowerCase();
  if (!SUPPORTED_MIME_PREFIXES.some((p) => mimeType.startsWith(p))) {
    return { ok: false, error: "unsupported_format" };
  }

  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
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
        console.error(`[assistant/media] vision failed (${model})`, error);
        return { ok: false, error: "failed" };
      }
      console.warn(`[assistant/media] vision model "${model}" unavailable, falling back`, error);
    }
  }
  console.error("[assistant/media] all vision models failed", lastError);
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
