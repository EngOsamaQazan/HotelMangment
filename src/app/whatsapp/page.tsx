"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle,
  Send,
  Loader2,
  Search,
  CheckCheck,
  Check,
  Clock,
  AlertTriangle,
  Phone,
  FileText,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Can } from "@/components/Can";

interface Thread {
  contactPhone: string;
  contactName: string | null;
  lastId: number;
  lastBody: string | null;
  lastType: string;
  lastDirection: "inbound" | "outbound";
  lastStatus: string;
  lastAt: string;
  unreadCount: number;
  totalCount: number;
}

interface TemplateRow {
  id: number;
  name: string;
  language: string;
  category: string;
  status: string;
}

interface Message {
  id: number;
  direction: "inbound" | "outbound";
  contactPhone: string;
  contactName: string | null;
  type: string;
  body: string | null;
  templateName: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function WhatsAppInboxPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateTo, setTemplateTo] = useState("");
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await fetch("/api/whatsapp/messages", { cache: "no-store" });
      const data = await readJsonSafe<Thread[]>(res, "فشل تحميل المحادثات");
      setThreads(data);
      if (!selected && data.length > 0) setSelected(data[0].contactPhone);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoadingThreads(false);
    }
  }, [selected]);

  const loadMessages = useCallback(async (contact: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/whatsapp/messages?contact=${encodeURIComponent(contact)}&limit=100`,
        { cache: "no-store" },
      );
      const data = await readJsonSafe<Message[]>(res, "فشل تحميل الرسائل");
      setMessages(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل التحميل");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const markThreadRead = useCallback(async (contact: string) => {
    try {
      const res = await fetch("/api/whatsapp/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact }),
      });
      if (!res.ok) return;
      // Optimistically clear the unread badge in the sidebar so it feels
      // instant — the next poll will confirm from server.
      setThreads((prev) =>
        prev.map((t) =>
          t.contactPhone === contact ? { ...t, unreadCount: 0 } : t,
        ),
      );
    } catch {
      // Non-fatal; unread will clear on next server poll anyway.
    }
  }, []);

  useEffect(() => {
    loadThreads();
    const int = setInterval(loadThreads, 10_000);
    return () => clearInterval(int);
  }, [loadThreads]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/templates", { cache: "no-store" });
      if (!res.ok) return;
      const data: TemplateRow[] = await res.json();
      setTemplates(data.filter((t) => t.status === "APPROVED"));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    loadMessages(selected);
    markThreadRead(selected);
    // Poll the active thread so new inbound messages appear without manual
    // refresh, and mark them read as they come in.
    const int = setInterval(() => {
      loadMessages(selected);
      markThreadRead(selected);
    }, 5_000);
    return () => clearInterval(int);
  }, [selected, loadMessages, markThreadRead]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredThreads = useMemo(() => {
    if (!search.trim()) return threads;
    const q = search.trim().toLowerCase();
    return threads.filter(
      (t) =>
        t.contactPhone.includes(q) ||
        (t.contactName ?? "").toLowerCase().includes(q),
    );
  }, [threads, search]);

  const activeThread = useMemo(
    () => threads.find((t) => t.contactPhone === selected) ?? null,
    [threads, selected],
  );

  async function send(to: string, text: string) {
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text }),
      });
      await readJsonSafe<unknown>(res, "فشل الإرسال");
      toast.success("تم الإرسال");
      setComposer("");
      // Refresh the active thread & the thread list.
      await Promise.all([loadMessages(to), loadThreads()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الإرسال");
    } finally {
      setSending(false);
    }
  }

  function submitComposer(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !composer.trim()) return;
    send(selected, composer.trim());
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!newTo.trim() || !composer.trim()) return;
    await send(newTo.trim(), composer.trim());
    setSelected(newTo.trim().replace(/\D/g, ""));
    setShowNew(false);
    setNewTo("");
  }

  async function sendTemplateTo(to: string, templateName: string, language: string) {
    setSendingTemplate(true);
    try {
      const res = await fetch("/api/whatsapp/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, templateName, language }),
      });
      await readJsonSafe<unknown>(res, "فشل إرسال القالب");
      toast.success(`تم إرسال القالب "${templateName}" بنجاح`);
      setShowTemplateModal(false);
      const normalized = to.replace(/\D/g, "");
      setSelected(normalized);
      await Promise.all([loadMessages(normalized), loadThreads()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل إرسال القالب");
    } finally {
      setSendingTemplate(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="pt-2 sm:pt-4 border-b-2 border-gold/30 pb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block w-1 h-8 bg-gold rounded-full" />
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-green-50 border border-green-200">
            <MessageCircle size={22} className="text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary font-[family-name:var(--font-amiri)] tracking-tight">
              واتساب
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              محادثات العملاء عبر WhatsApp Business Cloud
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Can permission="whatsapp:send_template">
            <button
              onClick={() => {
                setTemplateTo(selected ? `+${selected}` : "");
                setShowTemplateModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg hover:bg-gold-soft text-sm font-medium"
              title="إرسال قالب معتمد — مناسب لأول رسالة خارج نافذة 24 ساعة"
            >
              <FileText size={16} />
              إرسال قالب
            </button>
          </Can>
          <Can permission="whatsapp:send">
            <button
              onClick={() => {
                setShowNew(true);
                setSelected(null);
                setComposer("");
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium"
            >
              <Phone size={16} />
              رسالة لرقم جديد
            </button>
          </Can>
        </div>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-3 h-[calc(100vh-14rem)] min-h-[500px]">
        {/* Threads */}
        <aside className="bg-card-bg rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-gray-100">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <Search size={14} className="text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث برقم أو اسم…"
                className="bg-transparent text-sm w-full focus:outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loadingThreads && threads.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="text-sm text-gray-400 text-center p-6">
                لا توجد محادثات بعد.
              </div>
            ) : (
              filteredThreads.map((t) => (
                <button
                  key={t.contactPhone}
                  onClick={() => {
                    setSelected(t.contactPhone);
                    setShowNew(false);
                  }}
                  className={cn(
                    "w-full text-right px-4 py-3 border-b border-gray-50 transition-colors flex items-start gap-3",
                    selected === t.contactPhone
                      ? "bg-gold-soft"
                      : "hover:bg-gray-50",
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                    {(t.contactName ?? t.contactPhone).slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm text-gray-800 truncate">
                        {t.contactName ?? `+${t.contactPhone}`}
                      </span>
                      <span className="text-[10px] text-gray-400 shrink-0">
                        {new Date(t.lastAt).toLocaleTimeString("ar", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 truncate">
                        {previewText(t)}
                      </span>
                      {t.unreadCount > 0 && (
                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center">
                          {t.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Active thread */}
        <section className="bg-card-bg rounded-xl shadow-sm overflow-hidden flex flex-col">
          {showNew ? (
            <NewMessagePane
              to={newTo}
              setTo={setNewTo}
              text={composer}
              setText={setComposer}
              sending={sending}
              onSubmit={submitNew}
              onCancel={() => setShowNew(false)}
            />
          ) : activeThread ? (
            <>
              <header className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">
                  {(activeThread.contactName ?? activeThread.contactPhone).slice(0, 2)}
                </div>
                <div>
                  <div className="font-medium text-sm text-gray-800">
                    {activeThread.contactName ?? `+${activeThread.contactPhone}`}
                  </div>
                  <div className="text-[11px] text-gray-500 direction-ltr text-right">
                    +{activeThread.contactPhone}
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 scrollbar-thin">
                {loadingMessages && messages.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => (
                      <MessageBubble key={m.id} m={m} />
                    ))}
                    <div ref={threadEndRef} />
                  </div>
                )}
              </div>

              <Can
                permission="whatsapp:send"
                fallback={
                  <div className="p-3 text-xs text-gray-400 text-center border-t border-gray-100">
                    ليس لديك صلاحية الإرسال.
                  </div>
                }
              >
                <form
                  onSubmit={submitComposer}
                  className="p-3 border-t border-gray-100 flex items-end gap-2"
                >
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    placeholder="اكتب رسالة…"
                    rows={2}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitComposer(e as unknown as React.FormEvent);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !composer.trim()}
                    className="h-[40px] px-3 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center gap-1 text-sm"
                  >
                    {sending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </form>
              </Can>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 gap-2">
              <MessageCircle size={48} className="opacity-40" />
              <p className="text-sm">اختر محادثة من القائمة أو ابدأ رسالة جديدة.</p>
            </div>
          )}
        </section>
      </div>

      {showTemplateModal && (
        <TemplateSendModal
          templates={templates}
          initialTo={templateTo}
          sending={sendingTemplate}
          onClose={() => setShowTemplateModal(false)}
          onSend={sendTemplateTo}
        />
      )}
    </div>
  );
}

function TemplateSendModal({
  templates,
  initialTo,
  sending,
  onClose,
  onSend,
}: {
  templates: TemplateRow[];
  initialTo: string;
  sending: boolean;
  onClose: () => void;
  onSend: (to: string, name: string, language: string) => void;
}) {
  const [to, setTo] = useState(initialTo);
  const [selectedId, setSelectedId] = useState<number | null>(
    templates[0]?.id ?? null,
  );
  const current = templates.find((t) => t.id === selectedId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !to.trim()) return;
    onSend(to.trim(), current.name, current.language);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={22} className="text-primary" />
            <h3 className="text-lg font-bold text-gray-800">إرسال قالب معتمد</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X size={18} />
          </button>
        </div>

        {templates.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              لا توجد قوالب معتمدة بعد. اذهب إلى{" "}
              <strong>الإعدادات ← واتساب ← قوالب الرسائل</strong> واضغط
              «مزامنة من Meta».
            </div>
          </div>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              القوالب المعتمدة تُرسَل بدون الحاجة لنافذة 24 ساعة، وهي الطريقة
              الصحيحة لأول تواصل مع عميل.
            </div>
            <label className="block">
              <span className="text-sm text-gray-600">رقم المستلم (مع رمز الدولة)</span>
              <input
                type="tel"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="+962781099910"
                required
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm direction-ltr text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">القالب</span>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.language} ({t.category})
                  </option>
                ))}
              </select>
            </label>
            {current && current.name === "hello_world" && (
              <div className="text-[11px] text-gray-500">
                محتوى القالب: «Hello World — Welcome and congratulations!!…».
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={sending || !current || !to.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm"
          >
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            إرسال القالب
          </button>
        </div>
      </form>
    </div>
  );
}

/** Read a fetch Response as JSON without throwing on empty/HTML bodies.
 *  - On `res.ok`: parses JSON (returns [] if empty).
 *  - On `!res.ok`: throws Error with the API's `error` field, the response
 *    text, or a generic fallback — never "Unexpected end of JSON input". */
async function readJsonSafe<T>(res: Response, fallbackMsg: string): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // not JSON
    }
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error?: string }).error ?? "")
        : "") ||
      text ||
      `${fallbackMsg} (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return (parsed ?? ([] as unknown)) as T;
}

function previewText(t: Thread): string {
  if (t.lastType === "template") return `📋 قالب: ${t.lastBody ?? ""}`;
  if (t.lastType === "image") return "📷 صورة";
  if (t.lastType === "document") return `📎 ${t.lastBody ?? "ملف"}`;
  if (t.lastType === "audio") return "🎵 مقطع صوتي";
  if (t.lastType === "video") return "🎬 فيديو";
  if (t.lastType === "location") return "📍 موقع";
  return t.lastBody ?? "";
}

function MessageBubble({ m }: { m: Message }) {
  const outbound = m.direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          outbound
            ? "bg-green-100 text-gray-800 rounded-bl-sm"
            : "bg-white text-gray-800 rounded-br-sm border border-gray-100",
          m.status === "failed" && "bg-red-50 border border-red-200",
        )}
      >
        {m.type === "template" && (
          <div className="text-[11px] font-medium text-gray-500 mb-1">
            📋 قالب: {m.templateName}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{m.body ?? ""}</div>
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 mt-1 justify-end">
          <span>
            {new Date(m.createdAt).toLocaleTimeString("ar", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {outbound && <StatusIcon status={m.status} />}
        </div>
        {m.status === "failed" && (
          <div className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
            <AlertTriangle size={12} />
            {m.errorMessage ?? "فشل الإرسال"}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "read":
      return <CheckCheck size={12} className="text-blue-500" />;
    case "delivered":
      return <CheckCheck size={12} />;
    case "sent":
      return <Check size={12} />;
    case "queued":
      return <Clock size={12} />;
    default:
      return null;
  }
}

function NewMessagePane({
  to,
  setTo,
  text,
  setText,
  sending,
  onSubmit,
  onCancel,
}: {
  to: string;
  setTo: (s: string) => void;
  text: string;
  setText: (s: string) => void;
  sending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex-1 flex flex-col">
      <header className="px-4 py-3 border-b border-gray-100 font-medium text-sm">
        رسالة جديدة
      </header>
      <div className="p-4 space-y-3 flex-1">
        <label className="block">
          <span className="text-xs text-gray-500">رقم الهاتف (مع رمز الدولة)</span>
          <input
            type="tel"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+962781099910"
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm direction-ltr text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">نص الرسالة</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
          <p className="text-[11px] text-amber-600 mt-1">
            ملاحظة: إرسال رسالة نصية لأول مرة خارج نافذة 24 ساعة يتطلب قالبًا
            معتمدًا من Meta. إن فشل الإرسال، استخدم "إعدادات واتساب" لإضافة
            قوالب.
          </p>
        </label>
      </div>
      <footer className="p-3 border-t border-gray-100 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={sending || !to || !text}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm"
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
          إرسال
        </button>
      </footer>
    </form>
  );
}
