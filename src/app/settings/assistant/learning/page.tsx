"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  Brain,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wand2,
  Plus,
  Pencil,
  Trash2,
  Tag,
  RefreshCcw,
  MessageSquare,
  Search,
  ChevronLeft,
  Flag,
} from "lucide-react";
import { Can } from "@/components/Can";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// /settings/assistant/learning — admin inbox for the assistant's
// self-learning loop:
//
//   • "إخفاقات" tab     → AssistantFailure rows the engine captured.
//                         Admin clicks "اقترح درساً" to fire the LLM
//                         drafter, or "تجاهل" to dismiss.
//   • "دروس مقترحة" tab → AssistantLesson(status="draft") awaiting review.
//   • "دروس فعّالة" tab  → AssistantLesson(status="approved" | "disabled").
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const SCOPE_OPTIONS = [
  { value: "global", label: "عام" },
  { value: "module:guests", label: "النزلاء" },
  { value: "module:reservations", label: "الحجوزات" },
  { value: "module:accounting", label: "المحاسبة" },
  { value: "module:tasks", label: "المهام" },
  { value: "module:maintenance", label: "الصيانة" },
  { value: "module:rooms", label: "الغرف" },
  { value: "module:settings", label: "الإعدادات" },
  { value: "module:assistant", label: "المساعد" },
];

const TAG_LABELS: Record<string, { label: string; tone: string }> = {
  not_found: { label: "بيانات غير موجودة", tone: "bg-amber-100 text-amber-800" },
  no_permission: { label: "نقص صلاحية", tone: "bg-rose-100 text-rose-700" },
  unclear: { label: "غموض/توضيح", tone: "bg-slate-100 text-slate-700" },
  hallucinated: { label: "اعتذار بلا أداة", tone: "bg-red-100 text-red-700" },
  tool_error: { label: "فشل أداة", tone: "bg-orange-100 text-orange-700" },
  uncertain: { label: "تردد/تشكيك", tone: "bg-purple-100 text-purple-700" },
  deflection: { label: "سؤال بدل إجابة", tone: "bg-blue-100 text-blue-700" },
  wrong_answer: { label: "إجابة خاطئة", tone: "bg-fuchsia-100 text-fuchsia-700" },
};

interface FailureRow {
  id: number;
  userText: string;
  assistantReply: string;
  toolsTried: Array<{ name: string; argumentsJson: string; ok: boolean; errorMessage?: string | null }>;
  pageContext: { path?: string; title?: string | null } | null;
  tags: string[];
  status: string;
  reviewNote: string | null;
  createdAt: string;
  conversation: { id: number; title: string; staff: string };
  lessons: Array<{ id: number; title: string; status: string }>;
}

interface LessonRow {
  id: number;
  title: string;
  triggerKeywords: string;
  guidance: string;
  scope: string;
  status: string;
  proposedByLlm: boolean;
  sourceFailureId: number | null;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationListRow {
  id: number;
  title: string;
  staff: string;
  messageCount: number;
  llmTurns: number;
  costUsd: number;
  lastUserMessage: string | null;
  lastUserAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

interface ConversationMessage {
  id: number;
  role: string;
  content: string;
  toolName: string | null;
  toolCalls: unknown[] | null;
  usage: unknown | null;
  createdAt: string;
  precedingUserId: number | null;
}

interface ConversationDetail {
  conversation: {
    id: number;
    title: string;
    staff: string;
    llmTurns: number;
    costUsd: number;
    lastMessageAt: string | null;
    createdAt: string;
  };
  messages: ConversationMessage[];
  failures: Array<{
    id: number;
    userMessageId: number | null;
    assistantReply: string;
    status: string;
    tags: unknown;
    createdAt: string;
  }>;
}

export default function AssistantLearningPage() {
  return (
    <Can permission="assistant:learning_review" fallback={<NoAccess />}>
      <Inner />
    </Can>
  );
}

function NoAccess() {
  return (
    <PageShell>
      <PageHeader title="تعلّم المساعد الذكي" />
      <div className="text-center py-12 text-gray-500">ليس لديك صلاحية الوصول إلى هذه الصفحة.</div>
    </PageShell>
  );
}

function Inner() {
  const [tab, setTab] = useState<"failures" | "drafts" | "approved" | "conversations">("failures");
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [failureSummary, setFailureSummary] = useState({ open: 0, drafted: 0, dismissed: 0, addressed: 0 });
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [lessonSummary, setLessonSummary] = useState({ draft: 0, approved: 0, disabled: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [conversations, setConversations] = useState<ConversationListRow[]>([]);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [conversationSearch, setConversationSearch] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  const loadFailures = useCallback(async () => {
    const res = await fetch(`/api/assistant/learning/failures?status=open&limit=100`, {
      cache: "no-store",
    });
    if (res.ok) {
      const j = await res.json();
      setFailures(Array.isArray(j.failures) ? j.failures : []);
      if (j.summary) setFailureSummary(j.summary);
    }
  }, []);

  const loadLessons = useCallback(async () => {
    const res = await fetch(`/api/assistant/learning/lessons?status=all`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      setLessons(Array.isArray(j.lessons) ? j.lessons : []);
      if (j.summary) setLessonSummary(j.summary);
    }
  }, []);

  const loadConversations = useCallback(
    async (search?: string) => {
      const qs = new URLSearchParams();
      qs.set("limit", "50");
      if (search) qs.set("search", search);
      const res = await fetch(`/api/assistant/learning/conversations?${qs.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        setConversations(Array.isArray(j.conversations) ? j.conversations : []);
        setConversationsTotal(Number(j.total) || 0);
      }
    },
    [],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadFailures(), loadLessons(), loadConversations()]);
    } finally {
      setLoading(false);
    }
  }, [loadFailures, loadLessons, loadConversations]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const draftLesson = useCallback(
    async (failureId: number) => {
      setBusy(`draft-${failureId}`);
      setError(null);
      try {
        const res = await fetch(`/api/assistant/learning/failures/${failureId}/draft`, {
          method: "POST",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(j.error || "فشل اقتراح الدرس");
        } else {
          await loadAll();
          setTab("drafts");
        }
      } finally {
        setBusy(null);
      }
    },
    [loadAll],
  );

  const updateFailure = useCallback(
    async (failureId: number, status: "dismissed" | "addressed" | "open") => {
      setBusy(`fstatus-${failureId}`);
      setError(null);
      try {
        const res = await fetch(`/api/assistant/learning/failures/${failureId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) setError(j.error || "فشل التحديث");
        await loadFailures();
      } finally {
        setBusy(null);
      }
    },
    [loadFailures],
  );

  const updateLesson = useCallback(
    async (lessonId: number, body: Record<string, unknown>) => {
      setBusy(`lstatus-${lessonId}`);
      setError(null);
      try {
        const res = await fetch(`/api/assistant/learning/lessons/${lessonId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) setError(j.error || "فشل التحديث");
        await loadAll();
      } finally {
        setBusy(null);
      }
    },
    [loadAll],
  );

  const drafts = useMemo(() => lessons.filter((l) => l.status === "draft"), [lessons]);
  const live = useMemo(() => lessons.filter((l) => l.status !== "draft"), [lessons]);

  if (loading) {
    return (
      <PageShell>
        <PageHeader title="تعلّم المساعد الذكي" />
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin" size={32} />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="تعلّم المساعد الذكي"
        description="راجع إخفاقات المساعد، حوّلها إلى دروس معتمدة، وراقب القواعد التي يتعلّمها النظام مع الزمن."
        icon={<Brain className="text-amber-500" />}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Stat
          label="إخفاقات مفتوحة"
          value={failureSummary.open}
          icon={AlertTriangle}
          tone="bg-amber-50 text-amber-700"
          active={tab === "failures"}
          onClick={() => setTab("failures")}
        />
        <Stat
          label="المحادثات"
          value={conversationsTotal}
          icon={MessageSquare}
          tone="bg-cyan-50 text-cyan-700"
          active={tab === "conversations"}
          onClick={() => setTab("conversations")}
        />
        <Stat
          label="دروس مقترحة"
          value={lessonSummary.draft}
          icon={Wand2}
          tone="bg-indigo-50 text-indigo-700"
          active={tab === "drafts"}
          onClick={() => setTab("drafts")}
        />
        <Stat
          label="دروس فعّالة"
          value={lessonSummary.approved}
          icon={CheckCircle2}
          tone="bg-emerald-50 text-emerald-700"
          active={tab === "approved"}
          onClick={() => setTab("approved")}
        />
        <Stat
          label="مُعالَجة"
          value={failureSummary.addressed}
          icon={Sparkles}
          tone="bg-slate-50 text-slate-700"
        />
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 flex-wrap">
          {(["failures", "conversations", "drafts", "approved"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                tab === k
                  ? "bg-amber-500 text-white"
                  : "bg-white text-gray-700 hover:bg-amber-50 border border-gray-200",
              )}
            >
              {k === "failures" && "إخفاقات"}
              {k === "conversations" && "كل المحادثات"}
              {k === "drafts" && "دروس مقترحة"}
              {k === "approved" && "دروس فعّالة"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-amber-600 px-2 py-1.5 border border-gray-200 rounded-md"
          >
            <RefreshCcw size={12} /> تحديث
          </button>
          {tab === "approved" && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Plus size={12} /> درس يدوي
            </button>
          )}
        </div>
      </div>

      {tab === "failures" && (
        <FailuresList
          failures={failures}
          busy={busy}
          onDraft={draftLesson}
          onDismiss={(id) => updateFailure(id, "dismissed")}
          onMarkAddressed={(id) => updateFailure(id, "addressed")}
        />
      )}
      {tab === "conversations" && activeConversationId == null && (
        <ConversationsList
          conversations={conversations}
          search={conversationSearch}
          onSearchChange={(v) => {
            setConversationSearch(v);
            void loadConversations(v);
          }}
          onOpen={(id) => setActiveConversationId(id)}
        />
      )}
      {tab === "conversations" && activeConversationId != null && (
        <ConversationDetailView
          conversationId={activeConversationId}
          onBack={() => setActiveConversationId(null)}
          onFlagged={() => {
            void loadFailures();
          }}
        />
      )}
      {tab === "drafts" && (
        <LessonsList
          lessons={drafts}
          busy={busy}
          onApprove={(id) => updateLesson(id, { status: "approved" })}
          onDisable={(id) => updateLesson(id, { status: "disabled" })}
          onEdit={(id, body) => updateLesson(id, body)}
        />
      )}
      {tab === "approved" && (
        <LessonsList
          lessons={live}
          busy={busy}
          onApprove={(id) => updateLesson(id, { status: "approved" })}
          onDisable={(id) => updateLesson(id, { status: "disabled" })}
          onEdit={(id, body) => updateLesson(id, body)}
        />
      )}

      {showCreate && (
        <CreateLessonModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void loadLessons();
          }}
        />
      )}
    </PageShell>
  );
}

// ─────────────────────── components ───────────────────────

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: typeof Sparkles;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "rounded-xl border p-3 text-right transition-shadow flex items-center gap-3",
        active ? "border-amber-400 shadow-sm" : "border-gray-200 hover:border-amber-300",
      )}
    >
      <div className={cn("rounded-lg p-2", tone)}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-[11px] text-gray-500">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </button>
  );
}

function FailuresList({
  failures,
  busy,
  onDraft,
  onDismiss,
  onMarkAddressed,
}: {
  failures: FailureRow[];
  busy: string | null;
  onDraft: (id: number) => void;
  onDismiss: (id: number) => void;
  onMarkAddressed: (id: number) => void;
}) {
  if (failures.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
        لا توجد إخفاقات مفتوحة. المساعد لم يعتذر للمستخدمين عن أي طلب لم يستطع تنفيذه.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {failures.map((f) => (
        <article key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-700">#{f.id}</span>
              <span>·</span>
              <span>{f.conversation.staff}</span>
              <span>·</span>
              <span dir="ltr">{new Date(f.createdAt).toLocaleString("ar-EG")}</span>
              {f.pageContext?.path && (
                <>
                  <span>·</span>
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]" dir="ltr">
                    {f.pageContext.path}
                  </code>
                </>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(f.tags || []).map((t) => (
                <span
                  key={t}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-medium",
                    TAG_LABELS[t]?.tone || "bg-gray-100 text-gray-700",
                  )}
                >
                  {TAG_LABELS[t]?.label || t}
                </span>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-amber-700 font-bold mb-1">
                سؤال الموظف
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{f.userText}</p>
            </div>
            <div className="bg-rose-50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wide text-rose-700 font-bold mb-1">
                ردّ المساعد
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{f.assistantReply}</p>
            </div>
          </div>

          {f.toolsTried.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                الأدوات التي جرّبها ({f.toolsTried.length})
              </summary>
              <ul className="mt-2 space-y-1 ps-4 list-disc">
                {f.toolsTried.map((t, idx) => (
                  <li key={idx} dir="ltr" className="font-mono text-[11px]">
                    <span className={t.ok ? "text-emerald-600" : "text-rose-600"}>
                      {t.ok ? "✓" : "✗"}
                    </span>{" "}
                    {t.name}({t.argumentsJson || "{}"})
                    {t.errorMessage ? <span className="text-gray-500"> — {t.errorMessage}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {f.lessons.length > 0 && (
            <div className="text-xs text-gray-600">
              مرتبط بدرس:{" "}
              {f.lessons.map((l) => (
                <span
                  key={l.id}
                  className="inline-block bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded mr-1"
                >
                  #{l.id} {l.title} ({l.status})
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              disabled={busy === `draft-${f.id}`}
              onClick={() => onDraft(f.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs"
            >
              {busy === `draft-${f.id}` ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Wand2 size={12} />
              )}
              اقترح درساً
            </button>
            <button
              disabled={busy === `fstatus-${f.id}`}
              onClick={() => onMarkAddressed(f.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs"
            >
              <CheckCircle2 size={12} />
              عُولِجت يدوياً
            </button>
            <button
              disabled={busy === `fstatus-${f.id}`}
              onClick={() => onDismiss(f.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
            >
              <XCircle size={12} />
              تجاهل
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function LessonsList({
  lessons,
  busy,
  onApprove,
  onDisable,
  onEdit,
}: {
  lessons: LessonRow[];
  busy: string | null;
  onApprove: (id: number) => void;
  onDisable: (id: number) => void;
  onEdit: (id: number, body: Record<string, unknown>) => void;
}) {
  if (lessons.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
        لا توجد دروس هنا بعد.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {lessons.map((l) => (
        <LessonCard
          key={l.id}
          lesson={l}
          busy={busy}
          onApprove={() => onApprove(l.id)}
          onDisable={() => onDisable(l.id)}
          onEdit={(body) => onEdit(l.id, body)}
        />
      ))}
    </div>
  );
}

function LessonCard({
  lesson,
  busy,
  onApprove,
  onDisable,
  onEdit,
}: {
  lesson: LessonRow;
  busy: string | null;
  onApprove: () => void;
  onDisable: () => void;
  onEdit: (body: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(lesson.title);
  const [guidance, setGuidance] = useState(lesson.guidance);
  const [keywords, setKeywords] = useState(lesson.triggerKeywords);
  const [scope, setScope] = useState(lesson.scope);

  const reset = useCallback(() => {
    setTitle(lesson.title);
    setGuidance(lesson.guidance);
    setKeywords(lesson.triggerKeywords);
    setScope(lesson.scope);
    setEditing(false);
  }, [lesson]);

  const submit = useCallback(() => {
    onEdit({
      title,
      guidance,
      triggerKeywords: keywords,
      scope,
    });
    setEditing(false);
  }, [onEdit, title, guidance, keywords, scope]);

  const statusTone =
    lesson.status === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : lesson.status === "draft"
        ? "bg-indigo-100 text-indigo-700"
        : "bg-gray-100 text-gray-600";

  return (
    <article className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1">
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-base font-bold border-b border-amber-300 focus:outline-none focus:border-amber-500"
            />
          ) : (
            <h3 className="text-base font-bold text-gray-800">{lesson.title}</h3>
          )}
          <div className="flex gap-2 text-[10px] text-gray-500 mt-1 flex-wrap items-center">
            <span className={cn("px-2 py-0.5 rounded-full font-medium", statusTone)}>
              {lesson.status === "approved" && "فعّال"}
              {lesson.status === "draft" && "مقترح"}
              {lesson.status === "disabled" && "معطّل"}
            </span>
            {editing ? (
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="text-[10px] border border-gray-300 rounded px-1 py-0.5"
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                {SCOPE_OPTIONS.find((o) => o.value === lesson.scope)?.label ?? lesson.scope}
              </span>
            )}
            {lesson.proposedByLlm && (
              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                اقتراح المساعد
              </span>
            )}
            <span>·</span>
            <span>استُعمل {lesson.usageCount} مرّة</span>
            {lesson.sourceFailureId && (
              <>
                <span>·</span>
                <span>مأخوذ من إخفاق #{lesson.sourceFailureId}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <textarea
          value={guidance}
          onChange={(e) => setGuidance(e.target.value)}
          rows={4}
          className="w-full border border-gray-300 rounded-md p-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      ) : (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-md p-3">
          {lesson.guidance}
        </p>
      )}

      <div className="text-xs text-gray-600 flex items-center gap-1.5 flex-wrap">
        <Tag size={12} />
        {editing ? (
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="مثال: زيارة, نزيل, كم مرّة"
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 focus:border-amber-500 focus:outline-none"
          />
        ) : keywords ? (
          <span dir="auto">{lesson.triggerKeywords}</span>
        ) : (
          <span className="text-gray-400">— بدون كلمات مفتاحية (يُحقن دائماً) —</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {editing ? (
          <>
            <button
              onClick={submit}
              disabled={busy === `lstatus-${lesson.id}`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs"
            >
              {busy === `lstatus-${lesson.id}` ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Pencil size={12} />
              )}
              حفظ
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
            >
              إلغاء
            </button>
          </>
        ) : (
          <>
            {lesson.status !== "approved" && (
              <button
                onClick={onApprove}
                disabled={busy === `lstatus-${lesson.id}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs"
              >
                <CheckCircle2 size={12} />
                {lesson.status === "draft" ? "اعتماد الدرس" : "إعادة تفعيل"}
              </button>
            )}
            {lesson.status !== "disabled" && (
              <button
                onClick={onDisable}
                disabled={busy === `lstatus-${lesson.id}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs"
              >
                <Trash2 size={12} />
                تعطيل
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs"
            >
              <Pencil size={12} /> تعديل
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function CreateLessonModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [guidance, setGuidance] = useState("");
  const [keywords, setKeywords] = useState("");
  const [scope, setScope] = useState("global");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!title.trim() || !guidance.trim()) {
      setError("العنوان ونصّ الدرس مطلوبان.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/assistant/learning/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          guidance,
          triggerKeywords: keywords,
          scope,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "فشل الإنشاء");
        return;
      }
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }, [title, guidance, keywords, scope, onCreated]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-5 space-y-3">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Plus size={16} className="text-amber-500" /> درس يدوي جديد
        </h3>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded px-2 py-1">{error}</div>}
        <div className="space-y-1">
          <label className="text-xs text-gray-600">العنوان</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثلاً: قبل الإجابة عن الزيارات استعمل getGuestProfile"
            className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-600">نصّ الدرس (يُحقن في برومبت كل جولة)</label>
          <textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            rows={4}
            placeholder="اكتب القاعدة بصيغة الأمر للمساعد..."
            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">كلمات التشغيل (اختياري)</label>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="مفصولة بفواصل"
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">النطاق</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            إلغاء
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md bg-amber-500 hover:bg-amber-600 text-white inline-flex items-center gap-1 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            إنشاء واعتماد
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Conversations review ───────────────────────

function ConversationsList({
  conversations,
  search,
  onSearchChange,
  onOpen,
}: {
  conversations: ConversationListRow[];
  search: string;
  onSearchChange: (v: string) => void;
  onOpen: (id: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ابحث في محتوى المحادثات أو اسم الموظف..."
          className="w-full pr-9 pl-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {conversations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
          لا توجد محادثات مطابقة. سجلّات الموظفين على «المساعد الذكي» ستظهر هنا.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c.id)}
              className="w-full flex items-start gap-3 p-3 text-right hover:bg-amber-50 transition-colors"
            >
              <div className="rounded-lg bg-cyan-50 text-cyan-700 p-2 shrink-0">
                <MessageSquare size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-800 truncate">
                    {c.title || `محادثة #${c.id}`}
                  </span>
                  <span className="text-[10px] text-gray-500">·</span>
                  <span className="text-[11px] text-gray-600">{c.staff}</span>
                  <span className="text-[10px] text-gray-500">·</span>
                  <span className="text-[10px] text-gray-500">
                    {c.messageCount} رسالة · {c.llmTurns} جولة LLM
                  </span>
                  {c.costUsd > 0 && (
                    <>
                      <span className="text-[10px] text-gray-500">·</span>
                      <span className="text-[10px] text-emerald-600 tabular-nums">
                        ${c.costUsd.toFixed(4)}
                      </span>
                    </>
                  )}
                </div>
                {c.lastUserMessage && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                    {c.lastUserMessage}
                  </p>
                )}
                <div className="text-[10px] text-gray-400 mt-1" dir="ltr">
                  {c.lastMessageAt
                    ? new Date(c.lastMessageAt).toLocaleString("ar-EG")
                    : new Date(c.createdAt).toLocaleString("ar-EG")}
                </div>
              </div>
              <ChevronLeft size={14} className="text-gray-400 mt-2" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationDetailView({
  conversationId,
  onBack,
  onFlagged,
}: {
  conversationId: number;
  onBack: () => void;
  onFlagged: () => void;
}) {
  const [data, setData] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flagging, setFlagging] = useState<{
    assistantMessageId: number;
    note: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assistant/learning/conversations/${conversationId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        setData(j as ConversationDetail);
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "تعذّر التحميل");
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitFlag = useCallback(async () => {
    if (!flagging) return;
    setBusy(flagging.assistantMessageId);
    setError(null);
    try {
      const res = await fetch(`/api/assistant/learning/failures/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          assistantMessageId: flagging.assistantMessageId,
          reviewNote: flagging.note,
          tags: ["wrong_answer"],
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "فشل الوسم");
      } else {
        setFlagging(null);
        onFlagged();
        await load();
      }
    } finally {
      setBusy(null);
    }
  }, [flagging, conversationId, onFlagged, load]);

  const flaggedAssistantIds = useMemo(() => {
    if (!data) return new Set<number>();
    const ids = new Set<number>();
    for (const f of data.failures) {
      if (f.userMessageId == null) continue;
      const userIdx = data.messages.findIndex((m) => m.id === f.userMessageId);
      if (userIdx === -1) continue;
      const next = data.messages
        .slice(userIdx + 1)
        .find((m) => m.role === "assistant" && m.content?.includes(f.assistantReply.slice(0, 40)));
      if (next) ids.add(next.id);
    }
    return ids;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
        {error || "تعذّر تحميل المحادثة."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
            aria-label="رجوع"
          >
            <ChevronLeft size={14} className="rotate-180" />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-800 truncate">
              {data.conversation.title}
            </div>
            <div className="text-[11px] text-gray-500">
              {data.conversation.staff} · {data.conversation.llmTurns} جولة · $
              {data.conversation.costUsd.toFixed(4)}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {data.messages.map((m) => (
          <ConversationMessageRow
            key={m.id}
            message={m}
            alreadyFlagged={flaggedAssistantIds.has(m.id)}
            busy={busy === m.id}
            onFlag={() =>
              setFlagging({ assistantMessageId: m.id, note: "" })
            }
          />
        ))}
      </div>

      {flagging && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg p-5 space-y-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Flag size={16} className="text-fuchsia-500" /> وسم الإجابة كخاطئة
            </h3>
            <p className="text-xs text-gray-600">
              ستضاف هذه الإجابة إلى قائمة الإخفاقات حتى تتمكن من اقتراح درس
              يصحّح المساعد. اكتب باختصار ما كان يجب أن يجيب به.
            </p>
            <textarea
              value={flagging.note}
              onChange={(e) =>
                setFlagging((prev) => (prev ? { ...prev, note: e.target.value } : prev))
              }
              rows={4}
              placeholder="مثال: كان يجب استدعاء أداة kpiOccupancy ثم استخراج إجمالي الغرف من Unit، وعدم الادعاء بأن البيانات غير متاحة."
              className="w-full border border-gray-300 rounded-md p-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setFlagging(null)}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={submitFlag}
                disabled={busy != null}
                className="px-3 py-1.5 text-sm rounded-md bg-fuchsia-500 hover:bg-fuchsia-600 text-white inline-flex items-center gap-1 disabled:opacity-60"
              >
                {busy != null ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Flag size={14} />
                )}
                وسم وإرسال
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationMessageRow({
  message,
  alreadyFlagged,
  busy,
  onFlag,
}: {
  message: ConversationMessage;
  alreadyFlagged: boolean;
  busy: boolean;
  onFlag: () => void;
}) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isAssistant = message.role === "assistant";
  const tone = isUser
    ? "bg-amber-50 border-amber-200"
    : isTool
      ? "bg-slate-50 border-slate-200"
      : "bg-white border-gray-200";

  const label = isUser
    ? "الموظف"
    : isTool
      ? `أداة: ${message.toolName ?? ""}`
      : "المساعد";

  return (
    <article className={cn("rounded-xl border p-3 space-y-2", tone)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-gray-500 flex items-center gap-2">
          <span className="font-bold text-gray-700">{label}</span>
          <span>·</span>
          <span dir="ltr">{new Date(message.createdAt).toLocaleString("ar-EG")}</span>
          {alreadyFlagged && (
            <>
              <span>·</span>
              <span className="px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 text-[10px] font-medium">
                موسومة
              </span>
            </>
          )}
        </div>
        {isAssistant && (
          <button
            onClick={onFlag}
            disabled={busy || alreadyFlagged}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 disabled:opacity-50"
            title="وسم كإجابة خاطئة وأرسل للمراجعة"
          >
            <Flag size={11} />
            وسم
          </button>
        )}
      </div>

      {isTool ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            عرض ناتج الأداة
          </summary>
          <pre
            dir="ltr"
            className="mt-2 bg-white border border-gray-200 rounded p-2 text-[11px] overflow-x-auto whitespace-pre-wrap"
          >
            {message.content}
          </pre>
        </details>
      ) : (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {message.content}
        </p>
      )}

      {isAssistant && Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
        <details className="text-[11px] text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">
            استدعى {message.toolCalls.length} أداة
          </summary>
          <ul className="mt-1 list-disc ps-4 space-y-0.5" dir="ltr">
            {message.toolCalls.map((tc, idx) => {
              const call = tc as { name?: string; argumentsJson?: string };
              return (
                <li key={idx} className="font-mono">
                  {call.name}({call.argumentsJson || "{}"})
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}
