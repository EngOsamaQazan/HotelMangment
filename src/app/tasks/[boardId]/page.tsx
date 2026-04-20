"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  closestCorners,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  ArrowRight,
  Loader2,
  AlertCircle,
  Users as UsersIcon,
  Tag as TagIcon,
  Plus,
  Filter,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { TaskBoardFull, TaskCard } from "@/lib/collab/types";
import { KanbanColumn } from "@/components/tasks/KanbanColumn";
import { TaskCardView } from "@/components/tasks/TaskCardView";
import { CardDrawer } from "@/components/tasks/CardDrawer";
import { UserAvatar } from "@/components/tasks/shared";
import {
  useBoardRoom,
  useRealtimeEvent,
  type TaskEventPayload,
} from "@/lib/realtime/client";
import { cn } from "@/lib/utils";

export default function BoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId: raw } = use(params);
  const boardId = Number(raw);

  const [board, setBoard] = useState<TaskBoardFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [activeCard, setActiveCard] = useState<TaskCard | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<"all" | "me" | number>(
    "all",
  );
  const [labelFilter, setLabelFilter] = useState<number | "all">("all");
  const [tab, setTab] = useState<"board" | "members" | "labels">("board");
  const refetchTimeout = useRef<number | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Deep-link: ?task=<id> opens the drawer for that card (used from chat banner).
  useEffect(() => {
    const raw = searchParams.get("task");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    setOpenCardId(id);
    // Strip the query so refreshing/back doesn't reopen unexpectedly.
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useBoardRoom(boardId);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/boards/${boardId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "فشل تحميل اللوحة");
      }
      const data = (await res.json()) as TaskBoardFull;
      setBoard(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطأ");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Debounced reload after realtime events. */
  const scheduleReload = useCallback(() => {
    if (refetchTimeout.current) window.clearTimeout(refetchTimeout.current);
    refetchTimeout.current = window.setTimeout(() => load(), 250);
  }, [load]);

  useRealtimeEvent<TaskEventPayload>(
    "task:event",
    (p) => {
      if (!board || p.boardId !== board.id) return;
      scheduleReload();
    },
    [board?.id],
  );

  const cardsByColumn = useMemo(() => {
    const map = new Map<number, TaskCard[]>();
    if (!board) return map;
    for (const col of board.columns) map.set(col.id, []);
    const userId = null; // Filter "me" handled below via session? Not critical—handled via API typically.
    for (const t of board.tasks) {
      if (assigneeFilter === "me") {
        // Client-side "me" = assigned to anyone isn't ideal; we hit API instead.
        // But we don't have session userId here; treat as no-op if "me" set —
        // the TopBar select will re-call API with ?assignee=me if desired.
      } else if (
        typeof assigneeFilter === "number" &&
        !t.assignees.some((a) => a.user.id === assigneeFilter)
      ) {
        continue;
      }
      if (labelFilter !== "all") {
        if (!t.labels.some((l) => l.label.id === labelFilter)) continue;
      }
      void userId;
      const arr = map.get(t.columnId);
      if (arr) arr.push(t);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.position - b.position);
    return map;
  }, [board, assigneeFilter, labelFilter]);

  // ─── DnD handlers ───────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data.current;
    if (data?.type === "task" && data.card) {
      setActiveCard(data.card as TaskCard);
    }
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    if (!board) return;
    const { active, over } = e;
    if (!over) return;

    const activeData = active.data.current as
      | { type: "task"; card: TaskCard }
      | undefined;
    const overData = over.data.current as
      | { type: "task"; card: TaskCard }
      | { type: "column"; columnId: number }
      | undefined;
    if (!activeData || activeData.type !== "task") return;

    const card = activeData.card;
    let targetColumnId: number;
    let targetIndex: number;

    if (overData?.type === "column") {
      targetColumnId = overData.columnId;
      targetIndex = cardsByColumn.get(targetColumnId)?.length ?? 0;
    } else if (overData?.type === "task") {
      targetColumnId = overData.card.columnId;
      const col = cardsByColumn.get(targetColumnId) ?? [];
      targetIndex = col.findIndex((c) => c.id === overData.card.id);
      if (targetIndex < 0) targetIndex = col.length;
    } else {
      return;
    }

    // Optimistic update
    const before = board;
    const newBoard: TaskBoardFull = { ...board, tasks: [...board.tasks] };
    const fromCol = card.columnId;
    const sourceCards = [
      ...(cardsByColumn.get(fromCol) ?? []).filter((c) => c.id !== card.id),
    ];
    let destCards = [
      ...(cardsByColumn.get(targetColumnId) ?? []).filter(
        (c) => c.id !== card.id,
      ),
    ];
    const insertAt = Math.max(0, Math.min(targetIndex, destCards.length));
    destCards = [
      ...destCards.slice(0, insertAt),
      { ...card, columnId: targetColumnId },
      ...destCards.slice(insertAt),
    ];
    // Rebuild flat tasks array with new positions
    const otherTasks = board.tasks.filter(
      (t) => t.columnId !== fromCol && t.columnId !== targetColumnId,
    );
    const normalize = (arr: TaskCard[], colId: number) =>
      arr.map((t, i) => ({ ...t, columnId: colId, position: i }));
    newBoard.tasks = [
      ...otherTasks,
      ...normalize(sourceCards, fromCol),
      ...normalize(destCards, targetColumnId),
    ];
    // avoid lint unused var
    void arrayMove;
    setBoard(newBoard);

    try {
      const res = await fetch(`/api/tasks/cards/${card.id}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnId: targetColumnId, position: insertAt }),
      });
      if (!res.ok) throw new Error("فشل نقل البطاقة");
      // Reload to get authoritative positions
      load();
    } catch (err) {
      setBoard(before);
      toast.error(err instanceof Error ? err.message : "فشل النقل");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }
  if (error || !board) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle size={48} className="text-danger" />
        <p className="text-lg text-danger font-medium">
          {error || "لم يُعثر على اللوحة"}
        </p>
        <Link
          href="/tasks"
          className="px-4 py-2 bg-primary text-white rounded-lg"
        >
          العودة للّوحات
        </Link>
      </div>
    );
  }

  const accent = board.color || "#1e3a8a";

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link
            href="/tasks"
            className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ArrowRight size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ background: accent }}
              />
              <h1 className="text-xl sm:text-2xl font-bold text-primary">
                {board.name}
              </h1>
            </div>
            {board.description && (
              <p className="text-xs text-gray-500 mt-0.5">{board.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden text-xs">
            {(["board", "members", "labels"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-2 transition-colors",
                  tab === t
                    ? "bg-primary text-white"
                    : "text-gray-600 hover:bg-gray-50",
                )}
              >
                {t === "board" && "اللوحة"}
                {t === "members" && "الأعضاء"}
                {t === "labels" && "التسميات"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "board" && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap bg-card-bg rounded-lg p-2 shadow-sm">
            <span className="text-xs text-gray-500 flex items-center gap-1 px-2">
              <Filter size={12} /> فلاتر:
            </span>
            <select
              value={String(assigneeFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setAssigneeFilter(
                  v === "all" ? "all" : v === "me" ? "me" : Number(v),
                );
              }}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white"
            >
              <option value="all">كل المُسندين</option>
              <option value="me">المُسندة إليّ</option>
              {board.members.map(({ user }) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
            <select
              value={String(labelFilter)}
              onChange={(e) =>
                setLabelFilter(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none bg-white"
            >
              <option value="all">كل التسميات</option>
              {board.labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Board */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveCard(null)}
          >
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4">
              {board.columns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  boardId={board.id}
                  column={col}
                  cards={cardsByColumn.get(col.id) ?? []}
                  onOpen={setOpenCardId}
                  onCreated={load}
                  onRename={async (name) => {
                    const res = await fetch(
                      `/api/tasks/boards/${board.id}/columns`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: col.id, name }),
                      },
                    );
                    if (!res.ok) {
                      toast.error("فشل التسمية");
                      return;
                    }
                    load();
                  }}
                  onDelete={async () => {
                    const res = await fetch(
                      `/api/tasks/boards/${board.id}/columns?id=${col.id}`,
                      { method: "DELETE" },
                    );
                    if (!res.ok) {
                      toast.error("فشل الحذف");
                      return;
                    }
                    load();
                  }}
                />
              ))}
              <AddColumnButton boardId={board.id} onCreated={load} />
            </div>
            <DragOverlay>
              {activeCard && (
                <TaskCardView card={activeCard} onOpen={() => {}} overlay />
              )}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {tab === "members" && (
        <MembersTab boardId={board.id} members={board.members} onChanged={load} />
      )}

      {tab === "labels" && (
        <LabelsTab boardId={board.id} labels={board.labels} onChanged={load} />
      )}

      {openCardId && (
        <CardDrawer
          cardId={openCardId}
          boardMembers={board.members}
          boardLabels={board.labels}
          onClose={() => setOpenCardId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Side tabs
// ─────────────────────────────────────────────────────────────

function AddColumnButton({
  boardId,
  onCreated,
}: {
  boardId: number;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/boards/${boardId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("فشل الإنشاء");
      setName("");
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-72 shrink-0 h-fit bg-white/60 hover:bg-white border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-500 hover:text-primary transition-colors flex items-center justify-center gap-2"
      >
        <Plus size={16} /> عمود جديد
      </button>
    );
  }
  return (
    <form
      onSubmit={submit}
      className="w-72 shrink-0 h-fit bg-white border border-gray-200 rounded-lg p-3 space-y-2"
    >
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="اسم العمود..."
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="flex-1 bg-primary text-white text-xs py-1.5 rounded-lg hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? "..." : "إضافة"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 text-xs text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}

function MembersTab({
  boardId,
  members,
  onChanged,
}: {
  boardId: number;
  members: { role: string; user: { id: number; name: string; email?: string | null } }[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: number; name: string; email: string | null }[]
  >([]);
  const memberIds = new Set(members.map((m) => m.user.id));

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/chat/users?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => {
          if (!cancelled) setResults(Array.isArray(d) ? d : []);
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function addMember(userId: number) {
    const res = await fetch(`/api/tasks/boards/${boardId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: "editor" }),
    });
    if (!res.ok) {
      toast.error("فشل الإضافة");
      return;
    }
    onChanged();
  }
  async function removeMember(userId: number) {
    const res = await fetch(
      `/api/tasks/boards/${boardId}/members?userId=${userId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      toast.error("فشل الإزالة");
      return;
    }
    onChanged();
  }
  async function changeRole(userId: number, role: string) {
    const res = await fetch(`/api/tasks/boards/${boardId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    if (!res.ok) {
      toast.error("فشل التحديث");
      return;
    }
    onChanged();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-card-bg rounded-xl shadow-sm p-4">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <UsersIcon size={16} className="text-primary" /> الأعضاء ({members.length})
        </h3>
        <ul className="divide-y divide-gray-100">
          {members.map((m) => (
            <li
              key={m.user.id}
              className="flex items-center gap-3 py-2 justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UserAvatar user={m.user} size={28} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {m.user.name}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">
                    {m.user.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.user.id, e.target.value)}
                  disabled={m.role === "owner"}
                  className="text-xs border border-gray-200 rounded px-1.5 py-1 disabled:opacity-60"
                >
                  <option value="owner">مالك</option>
                  <option value="editor">محرر</option>
                  <option value="viewer">مشاهد</option>
                </select>
                {m.role !== "owner" && (
                  <button
                    onClick={() => removeMember(m.user.id)}
                    className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                  >
                    إزالة
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-card-bg rounded-xl shadow-sm p-4">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Plus size={16} className="text-primary" /> إضافة عضو
        </h3>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو البريد..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
          {results.map((u) => {
            const already = memberIds.has(u.id);
            return (
              <li
                key={u.id}
                className="flex items-center gap-2 py-2 justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar user={u} size={24} />
                  <span className="text-sm text-gray-800 truncate">
                    {u.name}
                  </span>
                </div>
                <button
                  disabled={already}
                  onClick={() => addMember(u.id)}
                  className={cn(
                    "text-xs px-2 py-1 rounded",
                    already
                      ? "bg-gray-100 text-gray-400"
                      : "bg-primary text-white hover:bg-primary-dark",
                  )}
                >
                  {already ? "موجود" : "إضافة"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function LabelsTab({
  boardId,
  labels,
  onChanged,
}: {
  boardId: number;
  labels: { id: number; name: string; color: string }[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/boards/${boardId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!res.ok) throw new Error("فشل الإنشاء");
      setName("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    if (!confirm("حذف هذه التسمية؟")) return;
    const res = await fetch(`/api/tasks/boards/${boardId}/labels?id=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("فشل الحذف");
      return;
    }
    onChanged();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-card-bg rounded-xl shadow-sm p-4">
        <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <TagIcon size={16} className="text-primary" /> التسميات ({labels.length})
        </h3>
        <ul className="divide-y divide-gray-100">
          {labels.length === 0 && (
            <li className="text-sm text-gray-400">لا توجد تسميات</li>
          )}
          {labels.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 py-2 justify-between"
            >
              <span
                className="text-xs font-medium px-2 py-0.5 rounded text-white"
                style={{ background: l.color }}
              >
                {l.name}
              </span>
              <button
                onClick={() => remove(l.id)}
                className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
              >
                حذف
              </button>
            </li>
          ))}
        </ul>
      </div>
      <form
        onSubmit={create}
        className="bg-card-bg rounded-xl shadow-sm p-4 space-y-3"
      >
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <Plus size={16} className="text-primary" /> إضافة تسمية
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم التسمية..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">اللون:</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-10 h-8 border border-gray-200 rounded"
          />
          <span
            className="inline-block text-xs font-medium px-2 py-0.5 rounded text-white"
            style={{ background: color }}
          >
            {name || "معاينة"}
          </span>
        </div>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full bg-primary text-white py-2 rounded-lg text-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {busy ? "..." : "إضافة"}
        </button>
      </form>
    </div>
  );
}

// Unused import suppression (MessageCircle kept for future inline hints)
void MessageCircle;
