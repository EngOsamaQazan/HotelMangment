"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Loader2,
  Trash2,
  Tag,
  UserPlus,
  Calendar,
  MessageCircle,
  Paperclip,
  CheckSquare,
  Send,
  Plus,
  History,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  TaskActivity,
  TaskAttachment,
  TaskCard,
  TaskChecklistItem,
  TaskComment,
  TaskLabel,
  TaskPriority,
  UserLite,
} from "@/lib/collab/types";
import { PRIORITY_META, UserAvatar, formatShortDate } from "./shared";

interface DetailCard extends TaskCard {
  board: { id: number; name: string; ownerId: number };
  column: { id: number; name: string };
  checklist: TaskChecklistItem[];
  comments: (TaskComment & { author: UserLite })[];
  attachments: TaskAttachment[];
  activities: (TaskActivity & { actor: UserLite })[];
}

interface Props {
  cardId: number;
  boardMembers: { role: string; user: UserLite }[];
  boardLabels: TaskLabel[];
  onClose: () => void;
  onChanged: () => void;
}

type Tab = "details" | "checklist" | "comments" | "activity";

export function CardDrawer({
  cardId,
  boardMembers,
  boardLabels,
  onClose,
  onChanged,
}: Props) {
  const [card, setCard] = useState<DetailCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("details");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/cards/${cardId}`);
      if (!res.ok) throw new Error("فشل تحميل البطاقة");
      const data = (await res.json()) as DetailCard;
      setCard(data);
      setTitle(data.title);
      setDescription(data.description || "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "خطأ");
      onClose();
    } finally {
      setLoading(false);
    }
  }, [cardId, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/tasks/cards/${cardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "فشل التحديث");
        }
        await load();
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "فشل التحديث");
      } finally {
        setSaving(false);
      }
    },
    [cardId, load, onChanged],
  );

  const del = useCallback(async () => {
    if (!confirm("حذف البطاقة نهائياً؟")) return;
    try {
      const res = await fetch(`/api/tasks/cards/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("فشل الحذف");
      toast.success("حذفت البطاقة");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الحذف");
    }
  }, [cardId, onClose, onChanged]);

  const openTaskChat = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "task",
          userIds: card?.assignees.map((a) => a.user.id) ?? [],
          taskId: cardId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل فتح المحادثة");
      }
      const conv = await res.json();
      window.location.href = `/chat/${conv.id}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل فتح المحادثة");
    }
  }, [cardId, card?.assignees]);

  return (
    <div
      className="fixed inset-0 z-[110] flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full max-w-2xl h-full shadow-xl flex flex-col animate-in slide-in-from-left duration-200">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">
              {card ? `${card.board.name} • ${card.column.name}` : "..."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={openTaskChat}
              title="محادثة البطاقة"
              className="p-1.5 rounded-lg hover:bg-white text-primary transition-colors"
            >
              <MessageCircle size={18} />
            </button>
            <button
              onClick={del}
              title="حذف"
              className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
            >
              <Trash2 size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {loading || !card ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 pt-5 pb-3 space-y-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title.trim() && title !== card.title)
                    patch({ title: title.trim() });
                }}
                className="w-full text-xl font-bold text-gray-800 bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg px-2 py-1 -mx-2"
              />

              {/* Quick actions row */}
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <select
                  value={card.priority}
                  onChange={(e) =>
                    patch({ priority: e.target.value as TaskPriority })
                  }
                  disabled={saving}
                  className={cn(
                    "text-xs px-2 py-1 rounded-full border font-medium focus:outline-none",
                    PRIORITY_META[card.priority].bg,
                    PRIORITY_META[card.priority].text,
                    PRIORITY_META[card.priority].border,
                  )}
                >
                  <option value="low">منخفضة</option>
                  <option value="med">متوسطة</option>
                  <option value="high">مرتفعة</option>
                  <option value="urgent">عاجلة</option>
                </select>
                <DueDateButton
                  value={card.dueAt}
                  onChange={(v) => patch({ dueAt: v })}
                />
                <button
                  type="button"
                  onClick={() =>
                    patch({ completed: !card.completedAt })
                  }
                  className={cn(
                    "text-xs px-3 py-1 rounded-full border font-medium flex items-center gap-1",
                    card.completedAt
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-emerald-50 hover:text-emerald-700",
                  )}
                >
                  <UserCheck size={12} />
                  {card.completedAt ? "مكتملة" : "تحديد كمكتملة"}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-100 px-6 flex gap-1 sticky top-0 bg-white z-10">
              {[
                { k: "details", label: "التفاصيل", icon: Paperclip },
                { k: "checklist", label: `قائمة مهام (${card.checklist.length})`, icon: CheckSquare },
                { k: "comments", label: `التعليقات (${card.comments.length})`, icon: MessageCircle },
                { k: "activity", label: "السجل", icon: History },
              ].map((t) => (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k as Tab)}
                  className={cn(
                    "px-3 py-2.5 text-sm border-b-2 transition-colors flex items-center gap-1.5",
                    tab === t.k
                      ? "border-primary text-primary font-semibold"
                      : "border-transparent text-gray-500 hover:text-gray-700",
                  )}
                >
                  <t.icon size={14} />
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "details" && (
              <div className="p-6 space-y-6">
                <section>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                    الوصف
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={() => {
                      if (description !== (card.description || ""))
                        patch({ description: description || null });
                    }}
                    placeholder="أضف وصفاً..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                  />
                </section>

                <AssigneesSection
                  card={card}
                  boardMembers={boardMembers}
                  onChanged={load}
                />

                <LabelsSection
                  card={card}
                  boardLabels={boardLabels}
                  onChanged={load}
                />

                <AttachmentsSection card={card} onChanged={load} />
              </div>
            )}
            {tab === "checklist" && (
              <div className="p-6">
                <ChecklistSection card={card} onChanged={load} />
              </div>
            )}
            {tab === "comments" && (
              <div className="p-6">
                <CommentsSection card={card} onChanged={load} />
              </div>
            )}
            {tab === "activity" && (
              <div className="p-6">
                <ActivitySection card={card} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-sections
// ─────────────────────────────────────────────────────────────

function DueDateButton({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const initial = value ? value.slice(0, 16) : "";
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(initial);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          // Sync local from the latest saved value each time we open.
          if (!open) setLocal(initial);
          setOpen((o) => !o);
        }}
        className={cn(
          "text-xs px-3 py-1 rounded-full border font-medium flex items-center gap-1",
          value
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-gray-50 text-gray-700 border-gray-200",
        )}
      >
        <Calendar size={12} />
        {value ? formatShortDate(value) : "تاريخ استحقاق"}
      </button>
      {open && (
        <div className="absolute top-full mt-1 start-0 z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2 w-64">
          <input
            type="datetime-local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(local ? new Date(local).toISOString() : null);
                setOpen(false);
              }}
              className="flex-1 bg-primary text-white text-xs py-1.5 rounded-lg"
            >
              حفظ
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="flex-1 bg-gray-100 text-gray-700 text-xs py-1.5 rounded-lg"
              >
                مسح
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AssigneesSection({
  card,
  boardMembers,
  onChanged,
}: {
  card: DetailCard;
  boardMembers: { role: string; user: UserLite }[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const assignedIds = new Set(card.assignees.map((a) => a.user.id));

  async function toggle(userId: number) {
    const method = assignedIds.has(userId) ? "DELETE" : "POST";
    const res = await fetch(`/api/tasks/cards/${card.id}/assignees`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "فشل التحديث");
      return;
    }
    onChanged();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-500">المُسندون</label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-primary flex items-center gap-1 hover:underline"
        >
          <UserPlus size={12} /> إدارة
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {card.assignees.length === 0 && (
          <span className="text-sm text-gray-400">لا أحد</span>
        )}
        {card.assignees.map(({ user }) => (
          <span
            key={user.id}
            className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full ps-1 pe-3 py-0.5"
          >
            <UserAvatar user={user} size={22} />
            <span className="text-xs text-gray-700">{user.name}</span>
          </span>
        ))}
      </div>
      {open && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {boardMembers.map(({ user }) => (
            <label
              key={user.id}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={assignedIds.has(user.id)}
                onChange={() => toggle(user.id)}
              />
              <UserAvatar user={user} size={22} />
              <span>{user.name}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function LabelsSection({
  card,
  boardLabels,
  onChanged,
}: {
  card: DetailCard;
  boardLabels: TaskLabel[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const assigned = new Set(card.labels.map((l) => l.label.id));

  async function toggle(labelId: number) {
    const method = assigned.has(labelId) ? "DELETE" : "POST";
    const res = await fetch(`/api/tasks/cards/${card.id}/labels`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labelId }),
    });
    if (!res.ok) {
      toast.error("فشل التحديث");
      return;
    }
    onChanged();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-500">التسميات</label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-primary flex items-center gap-1 hover:underline"
        >
          <Tag size={12} /> إدارة
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {card.labels.length === 0 && (
          <span className="text-sm text-gray-400">لا توجد</span>
        )}
        {card.labels.map(({ label }) => (
          <span
            key={label.id}
            className="text-[11px] font-medium px-2 py-0.5 rounded text-white"
            style={{ background: label.color }}
          >
            {label.name}
          </span>
        ))}
      </div>
      {open && (
        <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {boardLabels.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">
              لا توجد تسميات في هذه اللوحة
            </div>
          )}
          {boardLabels.map((lab) => (
            <label
              key={lab.id}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={assigned.has(lab.id)}
                onChange={() => toggle(lab.id)}
              />
              <span
                className="inline-block w-4 h-4 rounded"
                style={{ background: lab.color }}
              />
              <span>{lab.name}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function ChecklistSection({
  card,
  onChanged,
}: {
  card: DetailCard;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/cards/${card.id}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!res.ok) throw new Error("فشل الإضافة");
      setText("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }
  async function toggle(item: TaskChecklistItem) {
    await fetch(`/api/tasks/cards/${card.id}/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !item.done }),
    });
    onChanged();
  }
  async function remove(item: TaskChecklistItem) {
    await fetch(`/api/tasks/cards/${card.id}/checklist/${item.id}`, {
      method: "DELETE",
    });
    onChanged();
  }

  const done = card.checklist.filter((c) => c.done).length;
  const total = card.checklist.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="space-y-3">
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{pct}% مكتمل</span>
            <span>
              {done} / {total}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      <ul className="space-y-1">
        {card.checklist.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-50 group"
          >
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggle(item)}
            />
            <span
              className={cn(
                "flex-1 text-sm",
                item.done && "line-through text-gray-400",
              )}
            >
              {item.text}
            </span>
            <button
              onClick={() => remove(item)}
              className="opacity-0 group-hover:opacity-100 text-red-500 text-xs"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="أضف عنصراً..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm disabled:opacity-50 flex items-center gap-1"
        >
          <Plus size={14} /> إضافة
        </button>
      </form>
    </div>
  );
}

function CommentsSection({
  card,
  onChanged,
}: {
  card: DetailCard;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/cards/${card.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text.trim() }),
      });
      if (!res.ok) throw new Error("فشل الإضافة");
      setText("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {card.comments.length === 0 && (
          <li className="text-sm text-gray-400 text-center py-4">
            لا توجد تعليقات بعد
          </li>
        )}
        {card.comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <UserAvatar user={c.author} size={32} />
            <div className="flex-1 bg-gray-50 rounded-lg p-3">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-gray-800">
                  {c.author.name}
                </span>
                <span className="text-[10px] text-gray-400">
                  {new Date(c.createdAt).toLocaleString("ar-EG", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {c.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب تعليقاً..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm disabled:opacity-50 flex items-center gap-1"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}

function AttachmentsSection({
  card,
  onChanged,
}: {
  card: DetailCard;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/tasks/cards/${card.id}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل الرفع");
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: number) {
    if (!confirm("حذف المرفق؟")) return;
    const res = await fetch(
      `/api/tasks/cards/${card.id}/attachments/${id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toast.error("فشل الحذف");
      return;
    }
    onChanged();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-gray-500">المرفقات</label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-xs text-primary flex items-center gap-1 hover:underline disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
          إضافة مرفق
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onFile}
        />
      </div>
      <ul className="space-y-1">
        {card.attachments.length === 0 && (
          <li className="text-sm text-gray-400">لا توجد مرفقات</li>
        )}
        {card.attachments.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-3 p-2 rounded border border-gray-100 group hover:border-gray-200"
          >
            <a
              href={`/api/files/task/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center gap-2 text-sm text-gray-700 hover:text-primary min-w-0"
            >
              <Paperclip size={14} className="text-gray-400 shrink-0" />
              <span className="truncate">{a.fileName}</span>
              <span className="text-xs text-gray-400 shrink-0">
                {(a.size / 1024).toFixed(0)} KB
              </span>
            </a>
            <button
              onClick={() => remove(a.id)}
              className="opacity-0 group-hover:opacity-100 text-red-500"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivitySection({ card }: { card: DetailCard }) {
  const labels = useMemo<Record<string, string>>(
    () => ({
      created: "أنشأ البطاقة",
      moved: "نقل البطاقة",
      assigned: "أسند البطاقة",
      unassigned: "أزال الإسناد",
      updated: "حدّث البطاقة",
      completed: "أنجز البطاقة",
      reopened: "أعاد فتح البطاقة",
      label_added: "أضاف تسمية",
      label_removed: "أزال تسمية",
      attachment: "أضاف مرفقاً",
      commented: "علّق",
    }),
    [],
  );
  return (
    <ol className="relative border-s border-gray-200 ps-4 space-y-4">
      {card.activities.length === 0 && (
        <li className="text-sm text-gray-400">لا يوجد نشاط بعد</li>
      )}
      {card.activities.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -start-[22px] top-1 w-3 h-3 rounded-full bg-primary ring-4 ring-white" />
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-medium text-gray-800">{a.actor.name}</span>
            <span className="text-gray-500">
              {labels[a.type] || a.type}
            </span>
          </div>
          <p className="text-[11px] text-gray-400">
            {new Date(a.createdAt).toLocaleString("ar-EG")}
          </p>
        </li>
      ))}
    </ol>
  );
}
