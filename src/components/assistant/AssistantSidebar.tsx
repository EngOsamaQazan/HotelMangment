"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationRow {
  id: number;
  title: string;
  createdAt: string;
  lastMessageAt: string | null;
  llmTurns: number;
  costUsdTotal: number;
}

interface Props {
  activeId: number | null;
}

export function AssistantSidebar({ activeId }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.conversations) ? data.conversations : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const conv: ConversationRow = await res.json();
      setItems((prev) => [conv, ...prev]);
      router.push(`/assistant/${conv.id}`);
    } finally {
      setCreating(false);
    }
  }, [creating, router]);

  const archive = useCallback(
    async (id: number) => {
      if (!confirm("هل تريد أرشفة هذه المحادثة؟")) return;
      const res = await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setItems((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) router.push("/assistant");
    },
    [activeId, router],
  );

  return (
    <aside className="w-full md:w-72 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <Sparkles size={18} className="text-amber-500" />
        <h2 className="font-bold text-sm flex-1">المساعد الذكي</h2>
        <button
          onClick={startNew}
          disabled={creating}
          className="px-2 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-60"
        >
          <Plus size={14} />
          محادثة
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-4 py-6 text-center text-xs text-gray-400">جاري التحميل…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-gray-400">
            لا توجد محادثات بعد. ابدأ واحدة جديدة من زر «محادثة» بالأعلى.
          </div>
        )}
        {items.map((c) => {
          const active = c.id === activeId;
          return (
            <div
              key={c.id}
              className={cn(
                "group flex items-center px-3 py-2.5 border-b border-gray-100 hover:bg-amber-50 transition-colors",
                active && "bg-amber-50 border-r-[3px] border-r-amber-500",
              )}
            >
              <Link href={`/assistant/${c.id}`} className="flex-1 min-w-0 block">
                <div className="text-sm font-medium text-gray-800 truncate">{c.title}</div>
                <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-2">
                  <span>{c.llmTurns} مرحلة</span>
                  <span>•</span>
                  <span>{c.costUsdTotal.toFixed(4)}$</span>
                </div>
              </Link>
              <button
                onClick={() => archive(c.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                title="أرشفة"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
