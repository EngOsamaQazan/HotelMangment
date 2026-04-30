import "server-only";
import { prisma } from "@/lib/prisma";
import { getLLMProvider } from "@/lib/llm";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Lesson drafter — given an open AssistantFailure, produce a candidate
// AssistantLesson(status="draft") for the admin to review.
//
// We deliberately do NOT auto-approve drafts. The user explicitly chose the
// "admin reviews everything" flow in the planning phase. Approval flips
// status -> "approved" and the loader picks it up on the next turn.
// ---------------------------------------------------------------------------

const ALLOWED_SCOPES = new Set([
  "global",
  "module:guests",
  "module:reservations",
  "module:accounting",
  "module:tasks",
  "module:maintenance",
  "module:rooms",
  "module:settings",
  "module:assistant",
]);

export interface DraftLessonResult {
  ok: boolean;
  lessonId?: number;
  message: string;
  cost?: number;
  errorCode?: "no_provider" | "not_found" | "already_drafted" | "invalid_response" | "internal";
}

/**
 * Run a single LLM call to convert a failure into a curated lesson draft.
 * The drafter is intentionally restrictive in what it can produce — see the
 * system prompt below — so we don't end up with rules that contradict the
 * core behaviour or leak user-specific details.
 */
export async function draftLessonForFailure(failureId: number): Promise<DraftLessonResult> {
  const failure = await prisma.assistantFailure.findUnique({
    where: { id: failureId },
    select: {
      id: true,
      userText: true,
      assistantReply: true,
      toolsTried: true,
      pageContext: true,
      tagsJson: true,
      status: true,
    },
  });
  if (!failure) {
    return { ok: false, message: "الإخفاق غير موجود.", errorCode: "not_found" };
  }
  if (failure.status === "drafted") {
    return {
      ok: false,
      message: "تم اقتراح درس لهذا الإخفاق مسبقاً. راجعه في تبويب \"دروس مقترحة\".",
      errorCode: "already_drafted",
    };
  }

  const provider = await getLLMProvider();
  if (!provider) {
    return {
      ok: false,
      message: "لم يتم ضبط مزوّد ذكاء اصطناعي. اضبط مفتاح OpenAI من /settings/whatsapp/bot.",
      errorCode: "no_provider",
    };
  }

  const tags = Array.isArray(failure.tagsJson) ? failure.tagsJson : [];
  const tools = Array.isArray(failure.toolsTried) ? failure.toolsTried : [];
  const pageCtx =
    failure.pageContext && typeof failure.pageContext === "object" && !Array.isArray(failure.pageContext)
      ? (failure.pageContext as { path?: string; title?: string | null })
      : null;

  const systemPrompt = `أنت مدقّق سلوك مساعد ذكي يخدم موظفي فندق. ستقرأ محادثة "فاشلة" انتهت باعتذار من المساعد، وتقترح درساً عربياً واحداً يمنع تكرار هذا الفشل في المستقبل.

**المخرج إلزاماً JSON صالح فقط** بهذه الحقول حصراً (بدون أي نص خارج JSON):
{
  "title": string,                  // عنوان قصير (≤60 حرفاً)
  "triggerKeywords": string,        // كلمات/مرادفات بالعربية مفصولة بفواصل (يمكن أن تكون فارغة)
  "guidance": string,               // 1-3 أسطر من التوجيه — وصف عام للسلوك المطلوب
  "scope": "global" | "module:guests" | "module:reservations" | "module:accounting" | "module:tasks" | "module:maintenance" | "module:rooms" | "module:settings" | "module:assistant"
}

قواعد إلزامية:
1. الدرس يجب أن يكون **عاماً** يصلح لأي مستخدم. لا تذكر أسماء أشخاص، أرقام هواتف، أرقام هويات، معرّفات قواعد بيانات، أرقام حسابات، أو أي تفاصيل خاصة بهذا الإخفاق.
2. ممنوع تماماً اختراع أرقام حسابات (مثل 5050) أو أسماء أدوات غير موجودة. إن كنت غير متأكد من اسم أداة فلا تذكره.
3. الدرس يخدم سياسة سلوك (مثلاً: "قبل الاعتذار جرّب أداة كذا"، "اطلب توضيحاً عوضاً عن التخمين"، "اربط هذا النوع من السؤال بالوحدة الفلانية"). لا يطلب درساً تعديل قاعدة بيانات أو إنشاء أداة.
4. لا تكرر معلومات موجودة بالأصل في برومبت النظام (المسرد، صلاحيات الموظف، قواعد القيد المزدوج…). الفائدة الحقيقية: تعلّم درس **جديد** من هذا الفشل.
5. إذا كان الفشل ناتجاً عن نقص صلاحية فقط (no_permission)، فالدرس يجب أن يكون: "اعتذار صريح + اقتراح طلب الصلاحية من المدير" — لا تقترح درساً يلتفّ على الصلاحيات.
6. لو لم تجد درساً ذا قيمة، أعد JSON بـ guidance="" — وسيتم تجاهل الاقتراح.

ردّك JSON فقط، بدون \`\`\` أو شرح.`;

  const userPayload = {
    rolePageContext: pageCtx ? `${pageCtx.path}${pageCtx.title ? ` (${pageCtx.title})` : ""}` : null,
    failureTags: tags,
    userQuestion: failure.userText,
    assistantApology: failure.assistantReply,
    toolsTried: tools,
  };

  let resp;
  try {
    resp = await provider.chat({
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `محتوى الإخفاق:\n\`\`\`json\n${JSON.stringify(userPayload, null, 2)}\n\`\`\`\n\nاقترح الدرس JSON الآن.`,
        },
      ],
      tools: [],
      temperature: 0.2,
      maxTokens: 400,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal";
    console.error("[assistant/learning] drafter call failed", e);
    return { ok: false, message: `فشل استدعاء النموذج: ${msg}`, errorCode: "internal" };
  }

  const raw = (resp.text ?? "").trim();
  const parsed = parseLessonJson(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      message: `النموذج أرجع رداً غير صالح: ${parsed.error}`,
      errorCode: "invalid_response",
      cost: resp.usage.costUsd,
    };
  }

  const guidance = parsed.value.guidance.trim();
  if (!guidance) {
    return {
      ok: false,
      message: "لم يجد النموذج درساً ذا قيمة لهذا الإخفاق. تجاهله أو اكتب درساً يدوياً.",
      errorCode: "invalid_response",
      cost: resp.usage.costUsd,
    };
  }

  const lesson = await prisma.$transaction(async (tx) => {
    const created = await tx.assistantLesson.create({
      data: {
        title: parsed.value.title.slice(0, 200),
        triggerKeywords: parsed.value.triggerKeywords.slice(0, 500),
        guidance: guidance.slice(0, 2000),
        scope: parsed.value.scope,
        status: "draft",
        sourceFailureId: failure.id,
        proposedByLlm: true,
      },
      select: { id: true },
    });
    await tx.assistantFailure.update({
      where: { id: failure.id },
      data: { status: "drafted" },
    });
    return created;
  });

  return {
    ok: true,
    lessonId: lesson.id,
    message: "تم اقتراح درس جديد. راجعه واعتمده من تبويب \"دروس مقترحة\".",
    cost: resp.usage.costUsd,
  };
}

// ─────────────────────── helpers ───────────────────────

interface ParsedLesson {
  title: string;
  triggerKeywords: string;
  guidance: string;
  scope: string;
}

function parseLessonJson(text: string): { ok: true; value: ParsedLesson } | { ok: false; error: string } {
  // Tolerate the model wrapping the JSON in ```json fences despite the
  // instructions — strip them before parsing.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned.startsWith("{")) return { ok: false, error: "لم يبدأ الردّ بـ {" };

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "JSON parse error" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "ليس كائناً." };
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const triggerKeywords = typeof obj.triggerKeywords === "string" ? obj.triggerKeywords.trim() : "";
  const guidance = typeof obj.guidance === "string" ? obj.guidance.trim() : "";
  const scope = typeof obj.scope === "string" ? obj.scope.trim() : "global";

  if (!title) return { ok: false, error: "title فارغ." };
  if (!ALLOWED_SCOPES.has(scope)) return { ok: false, error: `scope غير مسموح: ${scope}` };

  return { ok: true, value: { title, triggerKeywords, guidance, scope } };
}

/**
 * Convenience helper used by the engine when persisting a freshly captured
 * AssistantFailure. Keeps the engine free of Prisma-specific JSON typing.
 */
export type FailureToolsTried = Prisma.InputJsonValue;
