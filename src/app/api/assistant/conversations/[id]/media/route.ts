import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleAuthError } from "@/lib/permissions/guard";
import { runAssistantTurn } from "@/lib/assistant/engine";
import { transcribeAudioBuffer } from "@/lib/assistant/media/transcribe";
import { describeImageBuffer } from "@/lib/assistant/media/describe-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/assistant/conversations/[id]/media
 *
 * Accepts a multipart upload from the in-app assistant chat:
 *   - field "audio" (Blob) — voice note recorded in the browser.
 *   - field "image" (Blob) — photo from the picker / camera.
 *   - field "kind"  ("audio" | "image") — explicit selector.
 *   - field "caption" (string, optional) — free text to accompany media.
 *   - field "pageContext" (JSON string, optional) — { path, title }.
 *
 * The handler:
 *   1. Transcribes audio (whisper / gpt-4o-mini-transcribe) OR describes
 *      images (gpt-4o-mini Vision).
 *   2. Forwards the resulting Arabic text to `runAssistantTurn` exactly
 *      like a typed message — so tools, drafts, and apology detection all
 *      work unchanged.
 *   3. Returns the same response shape as the text `messages` route so the
 *      UI just merges new messages + actions.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requirePermission("assistant:use");
    const userId = Number((session.user as { id?: string | number }).id);
    const staffName = (session.user?.name as string | undefined) ?? "الموظف";
    const { id } = await params;
    const convId = Number(id);
    if (!Number.isFinite(convId)) {
      return NextResponse.json({ error: "id غير صالح" }, { status: 400 });
    }

    const conv = await prisma.assistantConversation.findUnique({
      where: { id: convId },
      select: { id: true, userId: true, title: true },
    });
    if (!conv || conv.userId !== userId) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "صيغة الطلب غير صالحة" }, { status: 400 });
    }

    const kindParam = String(form.get("kind") ?? "").toLowerCase();
    const caption = String(form.get("caption") ?? "").trim().slice(0, 2000);
    const pageContextRaw = form.get("pageContext");
    let pageContext: { path: string; title: string | null } | null = null;
    if (typeof pageContextRaw === "string" && pageContextRaw.trim()) {
      try {
        const parsed = JSON.parse(pageContextRaw) as { path?: string; title?: string | null };
        if (parsed?.path) {
          pageContext = { path: String(parsed.path), title: parsed.title ?? null };
        }
      } catch {
        pageContext = null;
      }
    }

    const audioBlob = form.get("audio") as Blob | null;
    const imageBlob = form.get("image") as Blob | null;
    const file =
      kindParam === "audio"
        ? audioBlob
        : kindParam === "image"
          ? imageBlob
          : (audioBlob ?? imageBlob);

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "لم يصل ملف" }, { status: 400 });
    }
    const kind: "audio" | "image" =
      kindParam === "image"
        ? "image"
        : kindParam === "audio"
          ? "audio"
          : (file as Blob).type?.startsWith("image/")
            ? "image"
            : "audio";

    const mimeType = (file as Blob).type || (kind === "audio" ? "audio/webm" : "image/jpeg");
    const arrayBuffer = await (file as Blob).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const limit = kind === "audio" ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES;
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
    }
    if (buffer.byteLength > limit) {
      return NextResponse.json(
        { error: kind === "audio" ? "التسجيل أكبر من الحد المسموح" : "الصورة أكبر من الحد المسموح" },
        { status: 413 },
      );
    }

    let userMessage: string;
    if (kind === "audio") {
      const transcription = await transcribeAudioBuffer({ buffer, mimeType });
      if (!transcription.ok) {
        return NextResponse.json(
          { error: audioErrorText(transcription.error) },
          { status: transcription.error === "no_audio_access" ? 503 : 422 },
        );
      }
      userMessage = caption
        ? `تسجيل صوتي من الموظف:\n${transcription.text}\n\nملاحظة الموظف: ${caption}`
        : `تسجيل صوتي من الموظف:\n${transcription.text}`;
    } else {
      const description = await describeImageBuffer({
        buffer,
        mimeType,
        caption: caption || null,
      });
      if (!description.ok) {
        return NextResponse.json(
          { error: imageErrorText(description.error) },
          { status: description.error === "no_vision_access" ? 503 : 422 },
        );
      }
      userMessage = caption
        ? `أرسل الموظف صورة عبر الواجهة. هذا تحليلها التلقائي:\n${description.text}\n\nملاحظة الموظف: ${caption}`
        : `أرسل الموظف صورة عبر الواجهة. هذا تحليلها التلقائي:\n${description.text}`;
    }

    if (conv.title === "محادثة جديدة") {
      const titleSeed = (caption || userMessage).replace(/\s+/g, " ").trim().slice(0, 60);
      if (titleSeed) {
        await prisma.assistantConversation.update({
          where: { id: convId },
          data: { title: titleSeed },
        });
      }
    }

    const result = await runAssistantTurn({
      conversationId: convId,
      userId,
      staffName,
      userMessage,
      pageContext,
    });

    const [messages, actions] = await Promise.all([
      prisma.assistantMessage.findMany({
        where: { conversationId: convId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          toolCalls: true,
          toolName: true,
          toolCallId: true,
          createdAt: true,
        },
      }),
      prisma.assistantAction.findMany({
        where: { conversationId: convId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          kind: true,
          summary: true,
          payload: true,
          status: true,
          executedRefId: true,
          errorMessage: true,
          expiresAt: true,
          createdAt: true,
          executedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      reply: result.text,
      pendingActionIds: result.pendingActionIds,
      mode: result.mode,
      costUsd: result.costUsd,
      messages,
      actions,
    });
  } catch (e) {
    const auth = handleAuthError(e);
    if (auth) return auth;
    console.error("POST /api/assistant/conversations/[id]/media", e);
    return NextResponse.json({ error: "فشل معالجة الملف" }, { status: 500 });
  }
}

function audioErrorText(reason: string): string {
  switch (reason) {
    case "missing_key":
      return "لم يتم ضبط مفتاح OpenAI بعد. تواصل مع المدير.";
    case "unsupported_provider":
      return "تفريغ التسجيلات الصوتية مدعوم حالياً مع OpenAI فقط.";
    case "too_large":
      return "التسجيل الصوتي أكبر من الحد المسموح.";
    case "empty":
      return "لم يستطع النظام استخراج نصّ من التسجيل. حاول التسجيل بصوت أوضح.";
    case "no_audio_access":
      return "مفتاح OpenAI الحالي غير مفعّل عليه نماذج تفريغ الصوت. فعّلها من إعدادات المشروع على platform.openai.com.";
    default:
      return "تعذّر تفريغ التسجيل الصوتي.";
  }
}

function imageErrorText(reason: string): string {
  switch (reason) {
    case "missing_key":
      return "لم يتم ضبط مفتاح OpenAI بعد. تواصل مع المدير.";
    case "unsupported_provider":
      return "تحليل الصور مدعوم حالياً مع OpenAI فقط.";
    case "unsupported_format":
      return "صيغة الصورة غير مدعومة. أرسلها بصيغة JPG/PNG/WebP.";
    case "too_large":
      return "الصورة أكبر من الحد المسموح.";
    case "no_vision_access":
      return "مفتاح OpenAI الحالي غير مفعّل عليه نماذج رؤية. فعّلها من إعدادات المشروع.";
    default:
      return "تعذّر تحليل الصورة.";
  }
}
