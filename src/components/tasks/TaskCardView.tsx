"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, MessageSquare, Paperclip, CheckSquare } from "lucide-react";
import type { TaskCard } from "@/lib/collab/types";
import { cn } from "@/lib/utils";
import {
  PriorityBadge,
  UserAvatar,
  formatShortDate,
  isOverdue,
} from "./shared";

interface Props {
  card: TaskCard;
  onOpen: (id: number) => void;
  overlay?: boolean;
}

export function TaskCardView({ card, onOpen, overlay }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `task-${card.id}`, data: { type: "task", card } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const checklistDone =
    card.checklist?.filter((c) => c.done).length ?? 0;
  const checklistTotal = card._count.checklist;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // dnd-kit swallows clicks during drag; this is fine.
        if (e.defaultPrevented) return;
        onOpen(card.id);
      }}
      className={cn(
        "bg-white rounded-lg shadow-sm border border-gray-200 p-3 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all space-y-2 select-none",
        isDragging && !overlay && "opacity-40",
        overlay && "shadow-lg rotate-1",
        card.completedAt && "opacity-70",
      )}
    >
      {/* Labels */}
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.labels.map(({ label }) => (
            <span
              key={label.id}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded text-white"
              style={{ background: label.color }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <h4
        className={cn(
          "text-sm font-medium text-gray-800 leading-snug line-clamp-2",
          card.completedAt && "line-through text-gray-400",
        )}
      >
        {card.title}
      </h4>

      {/* Meta row */}
      <div className="flex items-center justify-between gap-2">
        <PriorityBadge priority={card.priority} size="xs" />
        {card.dueAt && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px]",
              isOverdue(card.dueAt) && !card.completedAt
                ? "text-red-600 font-bold"
                : "text-gray-500",
            )}
          >
            <Calendar size={10} />
            {formatShortDate(card.dueAt)}
          </span>
        )}
      </div>

      {/* Footer: icons + assignees */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          {checklistTotal > 0 && (
            <span className="flex items-center gap-1">
              <CheckSquare size={12} />
              {checklistDone}/{checklistTotal}
            </span>
          )}
          {card._count.comments > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {card._count.comments}
            </span>
          )}
          {card._count.attachments > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip size={12} />
              {card._count.attachments}
            </span>
          )}
        </div>
        <div className="flex -space-x-2 rtl:space-x-reverse">
          {card.assignees.slice(0, 3).map(({ user }) => (
            <UserAvatar
              key={user.id}
              user={user}
              size={22}
              className="ring-2 ring-white"
            />
          ))}
          {card.assignees.length > 3 && (
            <span className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full bg-gray-200 text-gray-600 text-[10px] ring-2 ring-white font-bold">
              +{card.assignees.length - 3}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
