"use client";

import { Loader2, Search, Tag, VolumeX, AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "../_types";
import {
  conversationDisplayName,
  conversationHasName,
  initials,
  messagePreview,
  relativeTime,
} from "../_utils";

interface Props {
  conversations: ConversationSummary[];
  selectedPhone: string | null;
  search: string;
  setSearch: (v: string) => void;
  loading: boolean;
  onSelect: (phone: string) => void;
}

const PRIORITY_COLOURS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  normal: "",
  low: "bg-gray-300",
};

export function ThreadList({
  conversations,
  selectedPhone,
  search,
  setSearch,
  loading,
  onSelect,
}: Props) {
  return (
    <>
      <div className="p-3 border-b border-gray-100">
        <label className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <Search size={14} className="text-gray-400 shrink-0" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث برقم أو اسم أو شركة…"
            className="bg-transparent text-sm w-full focus:outline-none"
            aria-label="بحث"
          />
        </label>
      </div>
      <div
        className="flex-1 overflow-y-auto scrollbar-thin"
        role="list"
        aria-busy={loading}
      >
        {loading && conversations.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-sm text-gray-400 text-center p-6">
            لا توجد محادثات مطابقة للبحث أو المرشحات.
          </div>
        ) : (
          conversations.map((c) => {
            const selected = selectedPhone === c.contactPhone;
            const name = conversationDisplayName(c);
            const prioDot = PRIORITY_COLOURS[c.priority];
            const phoneDisplay = c.contactPhone ? `+${c.contactPhone}` : "";
            const hasNamedContact = conversationHasName(c);
            return (
              <button
                key={c.id}
                role="listitem"
                onClick={() => onSelect(c.contactPhone)}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "w-full text-right px-3 sm:px-4 py-3 border-b border-gray-50 transition-colors flex items-start gap-3",
                  "min-h-[64px] touch-manipulation",
                  selected ? "bg-gold-soft" : "hover:bg-gray-50 active:bg-gray-100",
                )}
              >
                <div
                  className={cn(
                    "relative w-11 h-11 rounded-full text-sm font-bold flex items-center justify-center shrink-0",
                    c.contact?.isBlocked
                      ? "bg-red-50 text-red-500"
                      : "bg-primary/10 text-primary",
                  )}
                  aria-hidden
                >
                  {initials(name)}
                  {prioDot && (
                    <span
                      title={c.priority}
                      className={cn(
                        "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white",
                        prioDot,
                      )}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-gray-800 truncate flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{name}</span>
                      {hasNamedContact && phoneDisplay && (
                        <span
                          className="text-[10px] font-normal text-gray-400 shrink-0"
                          dir="ltr"
                        >
                          {phoneDisplay}
                        </span>
                      )}
                      {c.isMuted && (
                        <VolumeX size={12} className="text-gray-400 shrink-0" />
                      )}
                      {c.contact?.isBlocked && (
                        <AlertOctagon
                          size={12}
                          className="text-red-400 shrink-0"
                        />
                      )}
                    </span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {relativeTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 truncate">
                      {messagePreview(c.lastMessage)}
                    </span>
                    {c.unreadCount > 0 && (
                      <span
                        className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-500 text-white text-[10px] font-bold flex items-center justify-center"
                        aria-label={`${c.unreadCount} رسائل غير مقروءة`}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {c.assignedTo ? (
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {c.assignedTo.name}
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                        غير مسندة
                      </span>
                    )}
                    {c.contact?.tags?.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                      >
                        <Tag size={9} />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
