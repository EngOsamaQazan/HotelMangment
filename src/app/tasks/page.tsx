"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  KanbanSquare,
  Users,
  Loader2,
  AlertCircle,
  X,
  Search,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskBoardLite, UserLite } from "@/lib/collab/types";
import { Can } from "@/components/Can";
import { UserAvatar } from "@/components/tasks/shared";

const PALETTE = [
  "#1e3a8a",
  "#0f766e",
  "#b45309",
  "#be185d",
  "#6d28d9",
  "#334155",
];

export default function TasksBoardsPage() {
  const [boards, setBoards] = useState<TaskBoardLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");

  const fetchBoards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/boards");
      if (!res.ok) throw new Error("فشل تحميل اللوحات");
      const data = await res.json();
      setBoards(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description || "").toLowerCase().includes(q),
    );
  }, [boards, query]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">{error}</p>
        <button
          onClick={fetchBoards}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-5 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold text-primary truncate leading-tight">
            لوحات المهام
          </h1>
          <p className="hidden sm:block text-xs sm:text-sm text-gray-500 mt-0.5 line-clamp-1">
            نظّم فريقك بطريقة كانبان مع تعيين، أولويات، وتواريخ استحقاق.
          </p>
        </div>
        <Can permission="tasks.boards:create">
          <button
            onClick={() => setShowForm(true)}
            className="tap-44 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark active:scale-[0.98] transition-[transform,background] text-xs sm:text-sm font-medium justify-center shrink-0"
          >
            <Plus size={16} className="sm:hidden" />
            <Plus size={18} className="hidden sm:inline" />
            <span className="whitespace-nowrap">لوحة جديدة</span>
          </button>
        </Can>
      </div>

      <div className="relative w-full sm:max-w-md">
        <Search
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث في اللوحات..."
          aria-label="ابحث في اللوحات"
          className="w-full bg-card-bg border border-gray-200 rounded-lg ps-9 pe-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          role="status"
          aria-live="polite"
        >
          <Loader2 size={32} className="animate-spin text-primary" />
          <span className="sr-only">جاري التحميل</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card-bg rounded-xl shadow-sm p-6 sm:p-10 flex flex-col items-center justify-center text-gray-400 text-center">
          <KanbanSquare size={48} className="mb-3 opacity-50" />
          <p className="mb-4 text-sm sm:text-base">
            {boards.length === 0
              ? "لم تُنشئ أي لوحة بعد"
              : "لا نتائج مطابقة"}
          </p>
          {boards.length === 0 && (
            <Can permission="tasks.boards:create">
              <button
                onClick={() => setShowForm(true)}
                className="tap-44 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
              >
                ابدأ بإنشاء لوحة
              </button>
            </Can>
          )}
        </div>
      ) : (
        <div className="boards-grid gap-3 sm:gap-4">
          {filtered.map((b) => (
            <BoardCard key={b.id} board={b} />
          ))}
        </div>
      )}

      {showForm && (
        <NewBoardModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            fetchBoards();
          }}
        />
      )}
    </div>
  );
}

function BoardCard({ board }: { board: TaskBoardLite }) {
  const accent = board.color || "#1e3a8a";
  return (
    <Link
      href={`/tasks/${board.id}`}
      className="bg-card-bg rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
    >
      <div
        className="h-2 w-full"
        style={{ background: accent }}
      />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-gray-800 group-hover:text-primary transition-colors line-clamp-1">
            {board.name}
          </h3>
          {board.archivedAt && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">
              <Archive size={10} /> مؤرشفة
            </span>
          )}
        </div>
        {board.description && (
          <p className="text-xs text-gray-500 line-clamp-2">
            {board.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 border-t border-gray-100">
          <span className="flex items-center gap-1">
            <KanbanSquare size={14} className="text-gray-400" />
            {board._count.tasks} مهمة
          </span>
          <span className="flex items-center gap-1">
            <Users size={14} className="text-gray-400" />
            {board._count.members} عضو
          </span>
        </div>
      </div>
    </Link>
  );
}

function NewBoardModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      const url = `/api/chat/users?q=${encodeURIComponent(search)}`;
      fetch(url)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (!cancelled) setUsers(Array.isArray(data) ? data : []);
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("اسم اللوحة مطلوب");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          memberIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل إنشاء اللوحة");
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء اللوحة");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-board-title"
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg overflow-hidden max-h-[95dvh] sm:max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 flex items-center justify-between border-b border-gray-100 sticky top-0 z-10">
          <h3 id="new-board-title" className="text-base sm:text-lg font-bold text-gray-800">
            لوحة جديدة
          </h3>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="tap-44 p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-6 space-y-4 overflow-y-auto"
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              اسم اللوحة
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: مشاريع الاستقبال"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الوصف
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف مختصر للوحة (اختياري)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              اللون
            </label>
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="اختيار لون اللوحة">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  role="radio"
                  aria-checked={color === c}
                  className={cn(
                    "w-10 h-10 sm:w-9 sm:h-9 rounded-full border-2 transition-transform touch-manipulation",
                    color === c ? "scale-110 border-gray-800" : "border-white",
                  )}
                  style={{ background: c }}
                  aria-label={`اختر اللون ${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              أضف أعضاء
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو البريد..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <div className="mt-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {users.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">
                  اكتب للبحث...
                </div>
              )}
              {users.map((u) => {
                const selected = memberIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        setMemberIds((prev) =>
                          e.target.checked
                            ? [...prev, u.id]
                            : prev.filter((x) => x !== u.id),
                        )
                      }
                    />
                    <UserAvatar user={u} size={22} />
                    <span className="text-gray-800">{u.name}</span>
                    <span className="text-xs text-gray-400">{u.email}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="tap-44 px-4 sm:px-6 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="tap-44 flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark active:scale-[0.99] transition-[transform,background] font-medium text-sm disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              {submitting ? "جاري الحفظ..." : "إنشاء اللوحة"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
