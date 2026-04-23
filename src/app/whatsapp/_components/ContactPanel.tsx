"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertOctagon,
  ExternalLink,
  Loader2,
  Save,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHasPermission } from "@/lib/permissions/client";
import type { ContactDetail, ConversationEvent, ConversationNote } from "../_types";
import { readJsonSafe, relativeTime } from "../_utils";

interface Props {
  phone: string;
  onClose: () => void;
  onChange: () => void;
  /**
   * `inline` (default) renders as a side drawer inside the conversation
   * layout, appropriate for lg+ viewports. `overlay` renders as a
   * fixed-position bottom-sheet with backdrop, appropriate for mobile and
   * tablet viewports where real-estate is scarce.
   */
  variant?: "inline" | "overlay";
  /** Extra classes appended to the root so the caller can toggle visibility. */
  className?: string;
}

type Tab = "profile" | "notes" | "timeline";

/**
 * Slide-over panel showing everything we know about the other side of the
 * conversation: profile + tags + internal notes (shared with other employees)
 * + assignment timeline + reservation linkage.
 *
 * Two layout variants:
 *   • inline  : `lg+` inline drawer inside the thread section.
 *   • overlay : bottom-sheet with backdrop for `< lg` devices. Includes a
 *               drag handle, dismiss-by-backdrop-tap, and Esc-to-close.
 */
export function ContactPanel({
  phone,
  onClose,
  onChange,
  variant = "inline",
  className,
}: Props) {
  const canManage = useHasPermission("whatsapp:manage_contacts");
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("profile");
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, n, e] = await Promise.all([
        fetch(`/api/whatsapp/contacts/${encodeURIComponent(phone)}`).then((r) =>
          r.ok ? (r.json() as Promise<ContactDetail>) : null,
        ),
        fetch(`/api/whatsapp/conversations/${encodeURIComponent(phone)}/notes`)
          .then((r) =>
            r.ok ? (r.json() as Promise<{ notes: ConversationNote[] }>) : { notes: [] },
          )
          .catch(() => ({ notes: [] })),
        fetch(`/api/whatsapp/conversations/${encodeURIComponent(phone)}/events`)
          .then((r) =>
            r.ok ? (r.json() as Promise<{ events: ConversationEvent[] }>) : { events: [] },
          )
          .catch(() => ({ events: [] })),
      ]);
      setContact(c);
      setNotes(n.notes);
      setEvents(e.events);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<ContactDetail>) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/whatsapp/contacts/${encodeURIComponent(phone)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const updated = await readJsonSafe<ContactDetail>(res, "فشل الحفظ");
      setContact(updated);
      onChange();
      toast.success("تم الحفظ");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }

  // Dismiss overlay on Escape for keyboard users.
  useEffect(() => {
    if (variant !== "overlay") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  const body = (
    <>
      {/* Drag handle — visual cue for "swipe/tap to dismiss"; overlay only. */}
      {variant === "overlay" && (
        <div className="flex justify-center pt-2 pb-1">
          <span
            aria-hidden
            className="w-10 h-1.5 rounded-full bg-gray-200"
          />
        </div>
      )}

      <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">تفاصيل جهة الاتصال</h3>
        <button
          onClick={onClose}
          className="tap-44 p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          aria-label="إغلاق"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex items-center gap-1 px-2 sm:px-3 pt-2" role="tablist">
        {([
          ["profile", "الملف"],
          ["notes", `ملاحظات (${notes.length})`],
          ["timeline", "السجل"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "tap-44 flex-1 min-h-[40px] text-xs font-medium py-1.5 rounded-md",
              tab === k
                ? "bg-gold-soft text-primary"
                : "text-gray-600 hover:bg-gray-50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 sm:p-4 space-y-4 text-sm pb-safe">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={18} className="animate-spin text-primary" />
          </div>
        )}

        {!loading && tab === "profile" && contact && (
          <ProfileTab
            contact={contact}
            canManage={canManage}
            saving={saving}
            onSave={save}
          />
        )}

        {!loading && tab === "notes" && (
          <NotesTab phone={phone} notes={notes} reload={load} />
        )}

        {!loading && tab === "timeline" && <TimelineTab events={events} />}
      </div>
    </>
  );

  if (variant === "overlay") {
    return (
      <>
        <div
          className={cn("fixed inset-0 z-40 bg-black/40", className)}
          onClick={onClose}
          aria-hidden
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="تفاصيل جهة الاتصال"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col",
            "max-h-[92dvh] min-h-[50dvh]",
            className,
          )}
        >
          {body}
        </aside>
      </>
    );
  }

  return (
    <aside
      aria-label="تفاصيل جهة الاتصال"
      className={cn(
        "w-[320px] lg:w-[340px] shrink-0 border-s border-gray-100 bg-white flex flex-col",
        className,
      )}
    >
      {body}
    </aside>
  );
}

// ─────────────── Profile tab ───────────────
function ProfileTab({
  contact,
  canManage,
  saving,
  onSave,
}: {
  contact: ContactDetail;
  canManage: boolean;
  saving: boolean;
  onSave: (p: Partial<ContactDetail>) => void;
}) {
  const [name, setName] = useState(contact.displayName ?? "");
  const [nickname, setNickname] = useState(contact.nickname ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [company, setCompany] = useState(contact.company ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [tags, setTags] = useState<string[]>(contact.tags ?? []);
  const [tagInput, setTagInput] = useState("");

  function addTag() {
    const v = tagInput.trim();
    if (!v) return;
    if (!tags.includes(v)) setTags([...tags, v]);
    setTagInput("");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        {contact.optedIn ? (
          <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded">
            <ShieldCheck size={11} />
            اشترك في المراسلة
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded">
            لم يوافق بعد
          </span>
        )}
        {contact.isBlocked && (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2 py-1 rounded">
            <AlertOctagon size={11} />
            محظور
          </span>
        )}
      </div>

      <Field label="الاسم المعروض">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          readOnly={!canManage}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </Field>
      <Field label="كنية / لقب">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          readOnly={!canManage}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </Field>
      <Field label="البريد">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          readOnly={!canManage}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          dir="ltr"
        />
      </Field>
      <Field label="الشركة / الجهة">
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          readOnly={!canManage}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </Field>
      <Field label="ملاحظات">
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          readOnly={!canManage}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </Field>
      <Field label="الوسوم">
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[11px] px-2 py-0.5 rounded-full"
            >
              <Tag size={9} />
              {t}
              {canManage && (
                <button
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="text-gray-400 hover:text-red-500"
                  aria-label={`حذف الوسم ${t}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        {canManage && (
          <div className="flex gap-1.5">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="+ وسم جديد"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={addTag}
              className="text-xs px-2 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              إضافة
            </button>
          </div>
        )}
      </Field>

      {canManage && (
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              onSave({
                displayName: name || null,
                nickname: nickname || null,
                email: email || null,
                company: company || null,
                notes: notes || null,
                tags,
              })
            }
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-lg py-2 text-sm hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            حفظ
          </button>
          <button
            onClick={() => onSave({ isBlocked: !contact.isBlocked })}
            disabled={saving}
            className={cn(
              "text-xs px-3 py-2 rounded-lg border",
              contact.isBlocked
                ? "border-green-200 text-green-700 hover:bg-green-50"
                : "border-red-200 text-red-600 hover:bg-red-50",
            )}
          >
            {contact.isBlocked ? "إلغاء الحظر" : "حظر"}
          </button>
        </div>
      )}

      {contact.conversation && (
        <div className="pt-3 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
          <span>رقم المحادثة #{contact.conversation.id}</span>
          <Link
            href={`/reservations?phone=${encodeURIComponent(contact.phone)}`}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            عرض الحجوزات <ExternalLink size={10} />
          </Link>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-gray-500">{label}</span>
      {children}
    </label>
  );
}

// ─────────────── Notes tab ───────────────
function NotesTab({
  phone,
  notes,
  reload,
}: {
  phone: string;
  notes: ConversationNote[];
  reload: () => void;
}) {
  const canWrite = useHasPermission("whatsapp:notes");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/whatsapp/conversations/${encodeURIComponent(phone)}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: v }),
        },
      );
      await readJsonSafe(res, "فشل إضافة الملاحظة");
      setText("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <form onSubmit={submit} className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="ملاحظة داخلية للفريق…"
            className="w-full border border-yellow-200 bg-yellow-50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
          />
          <button
            type="submit"
            disabled={saving || !text.trim()}
            className="w-full bg-yellow-500 text-yellow-900 rounded-lg py-1.5 text-xs font-medium hover:bg-yellow-600 disabled:opacity-50"
          >
            {saving ? "جاري الحفظ…" : "إضافة ملاحظة"}
          </button>
        </form>
      )}
      <div className="space-y-2">
        {notes.length === 0 && (
          <div className="text-xs text-gray-400 text-center py-6">
            لا ملاحظات بعد على هذه المحادثة.
          </div>
        )}
        {notes.map((n) => (
          <div
            key={n.id}
            className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"
          >
            <div className="flex items-center justify-between text-[11px] text-yellow-800 mb-1">
              <span className="font-medium">{n.author.name}</span>
              <span>{relativeTime(n.createdAt)}</span>
            </div>
            <div className="text-sm text-yellow-900 whitespace-pre-wrap">
              {n.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── Timeline tab ───────────────
function TimelineTab({ events }: { events: ConversationEvent[] }) {
  if (!events.length)
    return (
      <div className="text-xs text-gray-400 text-center py-6">
        لا توجد أحداث على هذه المحادثة بعد.
      </div>
    );
  return (
    <ol className="relative space-y-3 ps-4 border-s border-gray-100">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -start-[5px] top-1.5 w-2 h-2 rounded-full bg-primary" />
          <div className="text-xs text-gray-700">{labelForEvent(e)}</div>
          <div className="text-[10px] text-gray-400">
            {e.actor?.name ? `${e.actor.name} · ` : ""}
            {relativeTime(e.createdAt)}
          </div>
        </li>
      ))}
    </ol>
  );
}

function labelForEvent(e: ConversationEvent): string {
  const meta = e.meta ?? {};
  if (e.action === "assign")
    return `تم الإسناد إلى ${String(meta.toUserName ?? "مستخدم")}`;
  if (e.action === "claim") return "تم استلام المحادثة";
  if (e.action === "unassign") return "تم إلغاء الإسناد";
  if (e.action.startsWith("status:"))
    return `تغيير الحالة إلى ${e.action.split(":")[1]}`;
  if (e.action.startsWith("priority:"))
    return `تغيير الأولوية إلى ${e.action.split(":")[1]}`;
  return e.action;
}
