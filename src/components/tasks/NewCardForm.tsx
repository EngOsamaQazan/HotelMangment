"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TaskPriority } from "@/lib/collab/types";

interface Props {
  boardId: number;
  columnId: number;
  onClose: () => void;
  onCreated: () => void;
}

export function NewCardForm({ boardId, columnId, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("med");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId,
          columnId,
          title: title.trim(),
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل الإنشاء");
      }
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-lg shadow border border-primary/30 p-2 space-y-2"
    >
      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="عنوان البطاقة..."
        className="w-full text-sm border-0 focus:outline-none focus:ring-0 p-1"
      />
      <div className="flex items-center gap-1">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none"
        >
          <option value="low">منخفضة</option>
          <option value="med">متوسطة</option>
          <option value="high">مرتفعة</option>
          <option value="urgent">عاجلة</option>
        </select>
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="flex-1 bg-primary text-white text-xs py-1.5 rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          إضافة
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          <X size={14} />
        </button>
      </div>
    </form>
  );
}
