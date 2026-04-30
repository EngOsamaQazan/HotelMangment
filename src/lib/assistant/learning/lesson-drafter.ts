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
 *
 * The drafter is fed the **exact tool inventory** and **schema cheat sheet**
 * the live assistant gets, plus the operator's `reviewNote` when present.
 * That changes the dominant failure mode from "lazy meta lessons like 'ask
 * for clarification'" to "concrete tool/SQL recipes that solve the failure".
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
      reviewNote: true,
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

  // Look up other open failures with overlapping keywords so the drafter
  // can recognise patterns instead of crafting one-off rules.
  const similar = await findSimilarFailures(failure.userText, failure.id);

  const systemPrompt = buildSystemPrompt();
  const userPayload = {
    pageContext: pageCtx ? `${pageCtx.path ?? ""}${pageCtx.title ? ` (${pageCtx.title})` : ""}` : null,
    failureTags: tags,
    userQuestion: failure.userText,
    assistantWrongReply: failure.assistantReply,
    operatorReviewNote: failure.reviewNote ?? null,
    toolsTriedDuringFailure: tools,
    similarOpenFailures: similar.map((s) => ({
      userQuestion: s.userText,
      assistantWrongReply: s.assistantReply.slice(0, 240),
    })),
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
      temperature: 0,
      maxTokens: 900,
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

  // Strict quality gate: reject low-value rules that just tell the assistant
  // to "ask for clarification" / "apologise nicely" without proposing a
  // concrete tool or SQL recipe. These are the regressive lessons the
  // admin saw in the previous drafter version — block them at the source.
  const rejection = qualityCheck(parsed.value, failure.userText);
  if (rejection) {
    return {
      ok: false,
      message: `النموذج أعاد درساً ضعيفاً (${rejection}). أعد المحاولة، أو اكتب الدرس يدوياً.`,
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

// ─────────────────────── prompt builder ───────────────────────

function buildSystemPrompt(): string {
  return `أنت مهندس برومبت يصنع "دروساً" تُحقن في برومبت مساعد ذكي يخدم موظفي فندق. مهمتك: تحويل إخفاق محدد إلى **وصفة عملية قابلة للتنفيذ** تحلّ نفس النوع من الأسئلة في المستقبل.

## أدوات المساعد المتاحة (لا تخترع أداة لا توجد هنا)

- **runSqlQuery** — قراءة فقط من PostgreSQL. الأداة الأقوى لكل سؤال إحصائي/بحثي ليس له أداة جاهزة.
- **getGuestProfile(name|id)** — ملف ضيف كامل + إحصاء زياراته.
- **searchParty(query)** — بحث في "Party" (موظف/شريك/مورّد).
- **getPartyBalance(partyId)** — رصيد طرف محاسبي.
- **searchAccount(query)** — بحث في شجرة "Account".
- **searchUnit(query)** — بحث وحدة (غرفة/شقة).
- **listAvailableUnits(checkIn, checkOut, ...)** — وحدات متاحة.
- **listOpenReservations** — حجوزات نشطة الآن.
- **searchCostCenter(query)** — بحث في "CostCenter".
- مقترحات يحتاج اعتمادها الموظف: \`proposeJournalEntry\`, \`proposeReservation\`, \`proposeMaintenanceRequest\`, \`proposeTaskCard\`, \`proposeUnitStatusChange\`, \`proposePayrollAdvance\`, \`proposeChange\`.

## مخطط قاعدة البيانات (مهم لكتابة SQL ضمن الدرس)

- "Account"(id, code, name, type, category, "parentId", "isActive"). type ∈ {asset, liability, equity, income, expense}. category قد تشمل: cash, bank, ar, ap, equity, revenue, expense.
- "JournalEntry"(id, "entryDate", description, status, total). "JournalLine"(id, "journalEntryId", "accountId", "partyId", "costCenterId", debit, credit). **رصيد حساب** = SUM(debit) - SUM(credit) من "JournalLine" حيث "accountId" = ?.
- "Party"(id, name, type, phone, "isActive"). type ∈ {guest, partner, supplier, employee, lender, other}.
- "Reservation"(id, "guestName", phone, nationality, "checkIn", "checkOut", status, source, "totalAmount", "paidAmount", remaining, "unitId"). status ∈ {upcoming, active, completed, cancelled, pending, pending_hold, no_show}.
- "Guest"(id, "reservationId", "fullName", "idNumber", nationality).
- "Unit"(id, "unitNumber", status, "unitTypeId"). "UnitType"(id, name, category, "basePricePerNight").
- "Maintenance"(id, "unitId", description, status, priority).
- "Task"(id, title, status, "assignedAt", "dueAt").
- "WhatsAppMessage"(id, "conversationId", direction, body, "createdAt").

أسماء الجداول والأعمدة بحالة Pascal/camel وبتنصيص مزدوج إجباري.

## المخرج إلزاماً JSON صالح فقط (بدون أي نص خارج JSON أو علامات code-fence)

{
  "title": string,                  // عنوان دقيق ≤80 حرفاً يصف *المشكلة المعالجة* (مثال: "حساب رصيد الصندوق النقدي" لا "تحسين الردود")
  "triggerKeywords": string,        // مرادفات عربية/إنكليزية مفصولة بفواصل تجعل الدرس يُختار حين يطرح الموظف نفس النوع من الأسئلة
  "guidance": string,               // الوصفة الفعلية — بأسلوب أمر مباشر للمساعد. اكتب SQL محدد أو أداة محددة كلما أمكن. ≤4 أسطر مكثفة.
  "scope": "global" | "module:guests" | "module:reservations" | "module:accounting" | "module:tasks" | "module:maintenance" | "module:rooms" | "module:settings" | "module:assistant"
}

## القواعد الإلزامية

1. **عملي لا فلسفي**: الدرس يجب أن يحتوي **أمراً واحداً** قابلاً للتنفيذ — استدعِ أداة س، أو نفّذ SQL ص، أو ابحث عن سجل في جدول ع. ممنوع منعاً باتاً درس من نوع: "اطلب توضيحاً قبل الردّ"، "تأكّد من فهم السؤال"، "كن أكثر دقة"، "اعتذر بأدب"، "تجنّب التخمين". هذه الدروس عديمة الفائدة وستُرفض.
2. **اقرأ \`operatorReviewNote\` بعناية**: لو المدير كتب ملاحظة فيها SQL أو اسم جدول/حساب، استخدمه حرفياً في \`guidance\` بصياغة المساعد.
3. **عمومية لا شخصنة**: لا تذكر أسماء أشخاص/أرقام هوية/معرّفات قاعدة بيانات/تواريخ بعينها. الأمثلة العامة فقط (مثل: استعمل ILIKE في الأسماء العربية).
4. **استعمل أرقام/أسماء حسابات بحذر**: إن كنت غير متأكد من رمز محاسبي محدد (مثل 1010)، فاكتب SQL يبحث عن الحساب أولاً عبر category أو ILIKE على الاسم بدل تثبيت الرقم.
5. **حلّ الفئة كاملة**: إن كان \`similarOpenFailures\` يظهر أن المستخدم سأل أسئلة من نفس النوع (عدد، رصيد، آخر سجلات)، اكتب الدرس بحيث يغطّي الفئة كلها وليس فقط الإخفاق الواحد.
6. **حالات الصلاحية فقط (\`no_permission\`)**: في هذه الحالة وحدها، الدرس يكون: "اعتذر صراحة، أوضح الصلاحية الناقصة بدقة، واقترح طلبها من مدير النظام". لا تلتفّ على الصلاحية.
7. **لو لم تجد درساً ذا قيمة عملية**: أرجع \`guidance=""\` وسيُرفض الاقتراح. هذا أفضل من إنتاج درس سطحي.

## مثال جيد (نموذج للسلوك المطلوب)

سؤال الموظف: "كم رصيد الصندوق النقدي؟"
ردّ خاطئ: "رصيد الصندوق النقدي 0 دينار."
\`\`\`json
{
  "title": "حساب رصيد الصندوق النقدي",
  "triggerKeywords": "صندوق, نقدي, كاش, رصيد الصندوق, خزنة",
  "guidance": "عند سؤال عن رصيد الصندوق/الكاش/النقدية: استدعِ runSqlQuery فوراً ولا تردّ بـ 0 ولا تطلب توضيحاً. الخطوات: (1) اعثر على الحساب: SELECT id, code, name FROM \\"Account\\" WHERE category='cash' OR name ILIKE '%صندوق%' أو '%cash%'. (2) احسب الرصيد: SELECT SUM(debit) - SUM(credit) AS balance FROM \\"JournalLine\\" WHERE \\"accountId\\" = <id>. (3) اعرض النتيجة مع اسم الحساب الذي حُسب منه. لو وُجد أكثر من حساب نقدي، اجمع رصيدهما واعرض الإجمالي + التفصيل.",
  "scope": "module:accounting"
}
\`\`\`

ردّك JSON فقط، بدون \\\`\\\`\\\` أو شرح خارجي.`;
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
  const start = cleaned.indexOf("{");
  if (start === -1) return { ok: false, error: "لم يجد { في الردّ" };
  const jsonOnly = cleaned.slice(start);

  let raw: unknown;
  try {
    raw = JSON.parse(jsonOnly);
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
 * Reject lesson drafts that are obviously low-value: meta-rules about
 * "ask for clarification" / "be careful" / "apologise" without any
 * concrete tool, SQL, or table reference. These regress the assistant's
 * behaviour into the very `deflection` failure mode we're trying to fix.
 *
 * Returns null when the draft passes; otherwise a short Arabic reason.
 */
function qualityCheck(value: ParsedLesson, originalUserText: string): string | null {
  const guidance = value.guidance.toLowerCase();
  const title = value.title.toLowerCase();

  // 1. Must mention at least one concrete tool or SQL pattern.
  const concreteSignals = [
    "runsqlquery",
    "getguestprofile",
    "searchparty",
    "getpartybalance",
    "searchaccount",
    "searchunit",
    "listavailableunits",
    "listopenreservations",
    "proposejournalentry",
    "proposereservation",
    "proposemaintenance",
    "proposetaskcard",
    "select ",
    'from "',
    "ilike",
    "where ",
  ];
  const hasConcrete = concreteSignals.some((sig) => guidance.includes(sig));
  if (!hasConcrete) {
    return "الدرس لا يستدعي أداة ولا يكتب SQL محدد";
  }

  // 2. Reject drafts whose title or guidance is dominated by the deflection
  // anti-pattern (asking the staff to clarify their already-clear question).
  const deflectionPhrases = [
    "اطلب توضيح",
    "اطلب توضيحاً",
    "طلب توضيح",
    "تأكد من فهم",
    "تأكد من السؤال",
    "اعتذر بأدب",
    "كن دقيقاً",
    "تجنّب التخمين",
    "تجنب التخمين",
  ];
  const guidanceWords = guidance.split(/\s+/).length;
  const deflectionHits = deflectionPhrases.filter(
    (p) => guidance.includes(p) || title.includes(p),
  ).length;
  if (deflectionHits > 0 && guidanceWords < 30) {
    return "الدرس يطلب توضيحاً بدل اقتراح أداة فعلية";
  }

  // 3. Drafts shorter than ~10 words are almost always vacuous.
  if (guidanceWords < 10) {
    return "الدرس قصير جداً ولا يحوي وصفة عملية";
  }

  // 4. Drafts that just paraphrase the original user question without a
  // recipe are useless. Heuristic: if 70%+ of the draft tokens come
  // verbatim from the user question, reject.
  const userTokens = new Set(
    originalUserText.split(/[\s،.,؟?!:]+/u).filter((t) => t.length > 2),
  );
  if (userTokens.size > 0) {
    const draftTokens = guidance.split(/[\s،.,؟?!:]+/u).filter((t) => t.length > 2);
    const overlap = draftTokens.filter((t) => userTokens.has(t)).length;
    if (overlap / Math.max(1, draftTokens.length) > 0.7) {
      return "الدرس مجرد إعادة صياغة لسؤال الموظف";
    }
  }

  return null;
}

/**
 * Naïve keyword overlap to surface other open failures the operator
 * raised that look related — gives the drafter context for a class-wide
 * lesson instead of a one-off rule.
 */
async function findSimilarFailures(userText: string, excludeId: number) {
  const tokens = Array.from(
    new Set(
      userText
        .split(/[\s،.,؟?!:]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3),
    ),
  ).slice(0, 6);
  if (tokens.length === 0) return [];

  const rows = await prisma.assistantFailure.findMany({
    where: {
      id: { not: excludeId },
      status: { in: ["open", "drafted"] },
      OR: tokens.map((t) => ({ userText: { contains: t } })),
    },
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { userText: true, assistantReply: true },
  });
  return rows;
}

/**
 * Convenience helper used by the engine when persisting a freshly captured
 * AssistantFailure. Keeps the engine free of Prisma-specific JSON typing.
 */
export type FailureToolsTried = Prisma.InputJsonValue;
