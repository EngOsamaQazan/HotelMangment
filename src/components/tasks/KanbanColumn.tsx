"use client";

import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus, MoreVertical } from "lucide-react";
import type { TaskCard, TaskColumn as TaskColumnT } from "@/lib/collab/types";
import { TaskCardView } from "./TaskCardView";
import { NewCardForm } from "./NewCardForm";
import { cn } from "@/lib/utils";

interface Props {
  boardId: number;
  column: TaskColumnT;
  cards: TaskCard[];
  onOpen: (id: number) => void;
  onCreated: () => void;
  onRename?: (newName: string) => void;
  onDelete?: () => void;
}

export function KanbanColumn({
  boardId,
  column,
  cards,
  onOpen,
  onCreated,
  onRename,
  onDelete,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: "column", columnId: column.id },
  });

  return (
    <div className="w-72 shrink-0 flex flex-col bg-gray-100 rounded-lg max-h-[calc(100vh-12rem)]">
      <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b border-gray-200">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== column.name && onRename)
                onRename(name.trim());
              else setName(column.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setName(column.name);
                setEditing(false);
              }
            }}
            className="flex-1 text-sm font-bold text-gray-800 bg-white border border-primary rounded px-2 py-0.5 focus:outline-none"
          />
        ) : (
          <h3
            onDoubleClick={() => onRename && setEditing(true)}
            className="text-sm font-bold text-gray-800 flex items-center gap-2"
            title={onRename ? "نقرة مزدوجة لإعادة التسمية" : undefined}
          >
            {column.name}
            <span className="text-xs font-normal text-gray-500 bg-gray-200 rounded-full px-2">
              {cards.length}
            </span>
          </h3>
        )}
        <div className="flex items-center gap-1 relative">
          <button
            onClick={() => setAdding(true)}
            className="p-1 rounded hover:bg-white text-gray-500 hover:text-primary transition-colors"
            title="إضافة بطاقة"
          >
            <Plus size={16} />
          </button>
          {(onRename || onDelete) && (
            <button
              onClick={() => setMenu((m) => !m)}
              className="p-1 rounded hover:bg-white text-gray-500"
            >
              <MoreVertical size={16} />
            </button>
          )}
          {menu && (
            <div className="absolute top-full end-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-md z-10 min-w-[140px] py-1">
              {onRename && (
                <button
                  onClick={() => {
                    setEditing(true);
                    setMenu(false);
                  }}
                  className="w-full text-start px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  إعادة تسمية
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    setMenu(false);
                    if (confirm(`حذف العمود "${column.name}"؟`)) onDelete();
                  }}
                  className="w-full text-start px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  حذف العمود
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 overflow-y-auto transition-colors",
          isOver && "bg-primary/5 ring-2 ring-primary/20 ring-inset",
        )}
      >
        <SortableContext
          items={cards.map((c) => `task-${c.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <TaskCardView key={card.id} card={card} onOpen={onOpen} />
          ))}
        </SortableContext>
        {cards.length === 0 && !adding && (
          <div className="text-center text-xs text-gray-400 py-6">
            لا توجد بطاقات
          </div>
        )}
        {adding && (
          <NewCardForm
            boardId={boardId}
            columnId={column.id}
            onClose={() => setAdding(false)}
            onCreated={onCreated}
          />
        )}
      </div>
      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-2 text-xs text-gray-500 hover:bg-gray-200 transition-colors flex items-center gap-1 border-t border-gray-200"
        >
          <Plus size={14} /> إضافة بطاقة
        </button>
      )}
    </div>
  );
}
